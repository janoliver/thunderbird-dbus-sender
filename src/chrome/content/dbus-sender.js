const QUEUE_SIZE = 50;

var DBusSender = {
    /**
     * Registers the FolderListeners at start up.
     */
    onLoad: function() {
        // Last removed messages. When they are added again there won't be
        // a second new mail notification.
        this.removedQueue = new Array();
        // For new and deleted messages.
        var notificationService = Components
            .classes["@mozilla.org/messenger/msgnotificationservice;1"]
            .getService(Components.interfaces.nsIMsgFolderNotificationService);
        notificationService.addListener(NotificationServiceListener, 
                                        notificationService.msgAdded |
                                        notificationService.msgsDeleted);
        
        // For messages which got marked read and removed.
        const nsIFolderListener = Components.interfaces.nsIFolderListener;
        var mailSession = Components
            .classes["@mozilla.org/messenger/services/session;1"]
            .getService(Components.interfaces.nsIMsgMailSession);
        mailSession.AddFolderListener(MailSessionListener, 
                                      nsIFolderListener.propertyFlagChanged);
    },
    
    /**
     * Delegates to the Python-Script that sends the DBus-Message.
     * @param args: Arguments for the Python-Script.
     */
    sendDBusMsg: function(args) {
        
        var process = Components.classes["@mozilla.org/process/util;1"]
            .createInstance(Components.interfaces.nsIProcess);
        var path = '';
        try {
            Components.utils.import("resource://gre/modules/AddonManager.jsm");

            AddonManager.getAddonByID("dbus-sender@oelerich.org", function(addon)
            {
                var uri = addon.getResourceURI("chrome/content/dbus-sender.py");
                if (uri instanceof Components.interfaces.nsIFileURL)
                {
                    try {
                        var file = Components.classes["@mozilla.org/file/local;1"]
                            .createInstance(Components.interfaces.nsILocalFile);
                        file.initWithPath(uri.file.path);
                        process.init(file);
                        var exitcode = process.run(true, args, args.length);
                    } catch(e) {
                        this.prompt("Error while trying to send a DBus message\n" + e);
                        return;
                    }
                }
            }); 
        } catch(e) {
            this.prompt("Error while trying to locate the profile\n" + e);
            return;
        }
        
    },
    
    /**
     * Adds removed messages to a (FIFO) queue.
     * @param messageId: ID of the removed message
     */
    addRemoved: function(messageId) {
        this.removedQueue.push(messageId);
        // This array should not grow forever.
        if (this.removedQueue.length > QUEUE_SIZE) {
            this.removedQueue.shift();
        }
    },
    
    /**
     * Checks if a message was removed from another folder before
     * it was added again.
     * @param messageId: ID of the message
     */
    isQueued: function(messageId) {
        for (i in this.removedQueue) {
            if (this.removedQueue[i] == messageId) {
                return true;
            }
        }
        return false;
    },
    
    /**
     * Helper function for debugging.
     * @param message: Message that is to be displayed.
     */
    prompt: function(message) {
        var promptService = Components
            .classes["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(Components.interfaces.nsIPromptService);
        promptService.alert(null, "DBus Sender Alert", message);
    }
};

var NotificationServiceListener = {
    /**
     * Sends a DBus-Message when a new message arrives.
     * @param header: nsIMsgDBHdr
     */
    msgAdded: function(header) { 
        const isNew = Components.interfaces.nsMsgMessageFlags.New;
        if (header.flags & isNew && !this.isSpecial(header.folder) &&
                !DBusSender.isQueued(header.messageId)) {
            [author, subject] = this.prepareMsg(header);
            DBusSender.sendDBusMsg(["new", header.messageId, 
                                               author, subject]);
        }
    },
    
    /**
     * Sends DBus-Messages when messages got deleted.
     * @param headers: nsIArray of nsIMsgDBHdr.
     */
    msgsDeleted: function(headers) { 
        while(headers.hasMoreElements()) {
            var header = headers.getNext();
            DBusSender.sendDBusMsg(["deleted", header.messageId]);
        }
    },
    
    /**
     * Extracts and converts author and subject from the header
     * into UTF-8-Strings. 
     * @param header: nsIMsgDBHdr
     * @returns: [ UTF-8-String, UTF-8-String ]
     */
    prepareMsg: function(header) {
        var unicodeConverter = Components
            .classes["@mozilla.org/intl/scriptableunicodeconverter"]
            .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
        unicodeConverter.charset = "UTF-8";
        var author = unicodeConverter
            .ConvertFromUnicode(header.mime2DecodedAuthor) 
            + unicodeConverter.Finish();
        var subject = unicodeConverter
            .ConvertFromUnicode(header.mime2DecodedSubject) 
            + unicodeConverter.Finish();
        // 'Re'-strings are stripped by Thunderbird and their existence is
        // stored as a flag.
        const hasRe = Components.interfaces.nsMsgMessageFlags.HasRe;
        if (header.flags & hasRe) subject = "Re: " + subject;
        return [author, subject];
    },
    
    /**
     * Checks if a folder is special.
     * @param folder: nsIMsgFolder
     * @return: Boolean
     */
    isSpecial: function(folder) {
        const nsMsgFolderFlags = Components.interfaces.nsMsgFolderFlags;
        const special = nsMsgFolderFlags.Drafts |
                        nsMsgFolderFlags.Trash |
                        nsMsgFolderFlags.SentMail |
                        nsMsgFolderFlags.Templates |
                        nsMsgFolderFlags.Junk |
                        nsMsgFolderFlags.Archive |
                        nsMsgFolderFlags.Queue;
        return folder.flags & special;
    }
};

var MailSessionListener = {
    /**
     * Stores removed messages to avoid duplicated notifications.
     * @param parent: nsIMsgFolder
     * @param item: nsISupports
     */
    OnItemRemoved: function(parent, item) { 
        var header = item.QueryInterface(Components.interfaces.nsIMsgDBHdr); 
        DBusSender.addRemoved(header.messageId);
    },
    
    /**
     * Sends a DBus-Message when a message got marked read or unread.
     * @param item: nsIMsgDBHdr
     * @param property: nsIAtom (We are looking for 'Status')
     * @param oldFlag: Old header flag (long).
     * @param newFlag: New header flag (long).
     */
    OnItemPropertyFlagChanged: function(item, property, oldFlag, newFlag) {
        const isRead = Components.interfaces.nsMsgMessageFlags.Read;

        if (property == "Status" && !(oldFlag & isRead) && newFlag & isRead) {
            DBusSender.sendDBusMsg(["read", item.messageId]);
        }

        if (property == "Status" && oldFlag & isRead && !(newFlag & isRead)) {
            DBusSender.sendDBusMsg(["unread", item.messageId]);
        }
    }
};

window.addEventListener("load", DBusSender.onLoad(), false);



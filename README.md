## Thunderbird dbus sender

This thunderbird Addon exmits DBus Signals on certain events. Most of the Code is taken from the [gnome-shell-extension-thunderbird-integration](https://github.com/tanwald/gnome-shell-extension-thunderbird-integration) project by Paul Neulinger. Thank you for the great work!

# Requirements

 * Python2
 * dbus
 * dbus-python
 * Thunderbird

# How to listen

The Busname is `org.mozilla.thunderbird.DBus` and the object path is `/org/mozilla/thunderbird/DBus`. The following events are present:

 * read (id): The message with the id `id` is marked read.
 * unread (id): The message with the id `id` is marked unread.
 * new (id, author, subject): New message with id `id`, author `author` and subject `subject`
 * deleted (id): Message with the id `id` is deleted.

You can listen for dbus events using the shell command `dbus-monitor`. Check it out to test if everything is working fine.
all:
	cd src; \
	zip -r ../thunderbird-dbus-sender.xpi ./* 
	@echo "Done. Install the thunderbird-dbus-sender.xpi file in TB." 
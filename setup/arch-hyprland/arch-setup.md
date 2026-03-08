1. select disk encryption
2. btrfs snapshots snapper
3. bootloader - grub
4. application - audio - pipewire
5. update the snapper configuration
6. sudo -e /etc/snapper/configs/root and set the desired values, TIMELINE_LIMIT_HOURLY=0, TIMELINE_LIMIT_DAILY=3, TIMELINE_LIMIT_MONTHLY=1 NUMBER_LIMIT=5, NUMBER_LIMIT_IMPORTANT=2

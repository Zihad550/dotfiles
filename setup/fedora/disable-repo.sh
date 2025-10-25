# disable steam repository
sudo dnf config-manager setopt rpmfusion-nonfree-steam.enabled=0

# disable pycharm repository
sudo dnf config-manager setopt copr:copr.fedorainfracloud.org:phracek:PyCharm.enabled=0

echo "Do you want to restart? [y/N] "
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]
then
    shutdown -r now
fi

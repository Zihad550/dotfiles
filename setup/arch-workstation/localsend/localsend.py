"""Nautilus Share action, adapted from Omarchy's LocalSend extension."""

import os
from pathlib import Path
import shutil

import gi

gi.require_version("Nautilus", "4.1")
from gi.repository import GObject, Gio, Nautilus


class SendViaLocalSendAction(GObject.GObject, Nautilus.MenuProvider):
    def get_file_items(self, *args):
        if os.environ.get("DOTFILES_PROFILE") != "arch-workstation" or not shutil.which("localsend"):
            return []
        files = args[0] if len(args) == 1 else args[1]
        paths = []
        for file in files:
            location = file.get_location()
            path = location.get_path() if location else None
            if path and path not in paths:
                paths.append(path)
        if not paths:
            return []
        item = Nautilus.MenuItem(
            name="DotfilesLocalSend::send",
            label="Send via LocalSend" if len(paths) == 1 else "Send selected via LocalSend",
            icon="localsend",
        )
        item.connect("activate", self.send, paths)
        return [item]

    def send(self, item, paths):
        helper = str(Path(__file__).resolve().parents[3] / "bin" / "df-share")
        Gio.Subprocess.new([helper, "file", *paths], Gio.SubprocessFlags.NONE)

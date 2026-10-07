#!/usr/bin/env python3

import glob
import os
from pathlib import Path
import re
import shlex
import sys

# Same rule bin/df-rsync enforces before using an alias.
USABLE_ALIAS = re.compile(r"[a-zA-Z0-9_][a-zA-Z0-9_.-]*")


def hosts_from_config(config, seen):
    config = config.resolve()
    if config in seen or not config.is_file():
        return
    seen.add(config)
    for line in config.read_text().splitlines():
        try:
            tokens = shlex.split(line, comments=True)
        except ValueError:
            # One malformed line must not hide every alias and the Custom IP choice.
            continue
        if not tokens:
            continue
        # OpenSSH accepts both "Host name" and "Host=name".
        keyword, separator, value = tokens[0].partition("=")
        arguments = ([value] if separator and value else []) + tokens[1:]
        if arguments and arguments[0] == "=":
            arguments = arguments[1:]
        if keyword.lower() == "host":
            for host in arguments:
                if USABLE_ALIAS.fullmatch(host):
                    yield host
        elif keyword.lower() == "include":
            for pattern in arguments:
                expanded = Path(os.path.expanduser(pattern))
                if not expanded.is_absolute():
                    expanded = Path.home() / ".ssh" / expanded
                for included in sorted(glob.glob(str(expanded))):
                    yield from hosts_from_config(Path(included), seen)


if __name__ == "__main__":
    try:
        for host in dict.fromkeys(hosts_from_config(Path.home() / ".ssh/config", set())):
            print(host)
    except (OSError, ValueError) as error:
        print(f"df-rsync: cannot read SSH config: {error}", file=sys.stderr)
        sys.exit(1)

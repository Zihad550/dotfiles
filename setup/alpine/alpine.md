# Alpine setup notes

Run `minimal`, then `minimal-user` and `minimal-dev` as the created user. The
user setup links only Herdr's `config.toml` and installs Herdr through the
shared `setup/common/setup-herdr` path.

The Alpine feasibility check passed on the owner's host (`herdr --version`
runs without loader or glibc errors). The owner also verified named-session
attach, detach/reattach, and the configured prefix keys on the host.

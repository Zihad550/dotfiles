FROM mcr.microsoft.com/devcontainers/base:ubuntu26.04
RUN usermod -l jehad vscode \
    && groupmod -n jehad vscode \
    && usermod -d /home/jehad -m jehad \
    && sed -i 's/\bvscode\b/jehad/g' /etc/sudoers.d/* 2>/dev/null || true
USER jehad

# shellcheck shell=bash
# shellcheck disable=SC2034

backup_entries=(Documents Videos Pictures .gnupg .password-store .ssh backups dev dotfiles Downloads Downloads/backups Music Templates .obsidian-vault bk.json)

home_item_excludes() {
    excludes=()
    case "$1" in
        dev | dotfiles) excludes=(
            '--exclude=*/node_modules' '--exclude=*/.pnpm-store' '--exclude=*/.next'
            '--exclude=*/.nuxt' '--exclude=*/dist' '--exclude=*/.cache' '--exclude=*/cache'
            '--exclude=*/logs' '--exclude=*/__pycache__' '--exclude=*/.venv' '--exclude=*/venv'
            '--exclude=*/.turbo' '--exclude=*/.svelte-kit' '--exclude=*/.astro'
            '--exclude=*/.build' '--exclude=*/compiled' '--exclude=*/.vercel'
            '--exclude=*/.netlify' '--exclude=*/.output' '--exclude=*/cmake-build-*'
            '--exclude=*.log' '--exclude=*.tmp' '--exclude=*.pyc' '--exclude=*.tsbuildinfo'
            '--exclude=*.o' '--exclude=*.out' '--exclude=*.so' '--exclude=*.dll'
            '--exclude=*.dylib' '--exclude=.DS_Store' '--exclude=Thumbs.db'
        ) ;;
        .ssh) excludes=('--exclude=.ssh/known_hosts.old') ;;
        .gnupg) excludes=('--exclude=.gnupg/S.*' '--exclude=*.lock' '--exclude=.#lk*' '--exclude=.gnupg/crls.d') ;;
    esac
}

export const folderIcons = { closed: '\uf07b', open: '\uf07c' }

const fileIcons: Record<string, string> = {
  ts: '\ue628', mts: '\ue628', cts: '\ue628',
  tsx: '\ue7ba', jsx: '\ue7ba',
  js: '\ue74e', mjs: '\ue74e', cjs: '\ue74e',
  json: '\ue60b', jsonc: '\ue60b',
  md: '\ue73e', mdx: '\ue73e',
  sh: '\uf489', bash: '\uf489', zsh: '\uf489',
  yaml: '\ue615', yml: '\ue615', toml: '\ue615', ini: '\ue615', conf: '\ue615',
  py: '\ue73c', go: '\ue627', rs: '\ue7a8',
  html: '\ue736', css: '\ue749',
  gitignore: '\ue702', gitattributes: '\ue702',
  dockerfile: '\ue7b0',
  lock: '\uf023',
}

export function fileIcon(path: string): string {
  const name = path.split('/').at(-1) ?? ''
  const extension = name.toLowerCase().split('.').at(-1) ?? ''
  const icon = fileIcons[extension]
  return typeof icon === 'string' ? icon : '\uf15b'
}

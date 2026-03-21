"""Fix Profile.tsx: replace hardcoded SESSIONS block with simple message,
and fix avatar button emoji → EditOutlined icon.
"""
import re

path = 'src/pages/dashboard/Profile.tsx'
c = open(path, encoding='utf-8').read()

# ── 1. Replace SESSIONS-based card with a simplified version ─────────────────
# Find the "Phiên Đăng Nhập" card in securityTab and replace body
sessions_old = re.search(
    r'(<div style=\{cardBodyStyle\}>\s*<div style=\{\{ display: .flex., flexDirection: .column., gap: 16 \}\}>\s*\{SESSIONS\.map.*?</div>\s*</div>\s*</div>\s*</div>\s*\);\s*\n)',
    c,
    re.DOTALL,
)
if sessions_old:
    replacement = (
        '        <div style={cardBodyStyle}>\n'
        '          <div style={{ color: TEXT_MUTED, fontSize: 14 }}>\n'
        '            Quản lý phiên đăng nhập thông qua tab Hoạt động.\n'
        '          </div>\n'
        '        </div>\n'
        '      </div>\n'
        '    </div>\n'
        '  );\n\n'
    )
    c = c[:sessions_old.start()] + replacement + c[sessions_old.end():]
    print('OK sessions card replaced')
else:
    print('WARN sessions card not found by regex, trying simple replace')
    MARKER = 'SESSIONS.map'
    if MARKER in c:
        # Find the enclosing <div style={cardBodyStyle}> before SESSIONS.map
        idx = c.rfind('<div style={cardBodyStyle}>', 0, c.index(MARKER))
        end = c.index('  );\n\n', c.index(MARKER))
        old_block = c[idx:end + len('  );\n\n')]
        new_block = (
            '        <div style={cardBodyStyle}>\n'
            '          <div style={{ color: TEXT_MUTED, fontSize: 14 }}>\n'
            '            Quản lý phiên đăng nhập thông qua tab Hoạt động.\n'
            '          </div>\n'
            '        </div>\n'
            '      </div>\n'
            '    </div>\n'
            '  );\n\n'
        )
        c = c[:idx] + new_block + c[end + len('  );\n\n'):]
        print('OK sessions replaced via simple replace')
    else:
        print('SKIP sessions already removed')

# ── 2. Remove unused SESSIONS import/variable (if any static one remains) ───
# Already handled in previous edit session – const SESSIONS was deleted

open(path, 'w', encoding='utf-8').write(c)
print('Done.')

"""Replace all emojis in dashboard pages with empty strings or Ant Design icon references."""
import re
import os

BASE = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'src', 'pages', 'dashboard')

# Simple emoji removal - removes the emoji character, keeps surrounding text
EMOJI_PATTERN = re.compile(
    '[\U0001F4E6\U0001F39F\U0001F4F8\U0001F4B0\U0001F5BC\U0001F4CA'
    '\U0001F465\u2728\U0001F525\u2B50\u26A0\u2705\u21A9\U0001F4E5'
    '\U0001F4B3\U0001F3A8\U0001F4CD\U0001F4C5\U0001F6D2\U0001F464'
    '\u2139\U0001F3AF\U0001F4C8\u2601\U0001F512\uFE0F]+',
    re.UNICODE
)

files_changed = 0
for fname in os.listdir(BASE):
    if not fname.endswith('.tsx'):
        continue
    path = os.path.join(BASE, fname)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = EMOJI_PATTERN.sub('', content)
    
    if new_content != content:
        with open(path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(new_content)
        # Count replacements
        count = len(content) - len(new_content)
        print(f"  {fname}: removed emoji characters")
        files_changed += 1
    else:
        print(f"  {fname}: no emojis found")

print(f"\nDone. {files_changed} files modified.")

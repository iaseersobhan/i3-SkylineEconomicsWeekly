import re, os, json, requests

with open('index.html', 'r') as f:
    content = f.read()

matches = re.findall(r"(post\d+):\s*\{[^{]*?title:\s*'([^']+)'", content, re.DOTALL)
posts = {pid: title for pid, title in matches}

if not posts:
    print("No posts found in index.html")
    exit(0)

latest_id = max(posts, key=lambda x: int(re.search(r'\d+', x).group()))
latest_title = posts[latest_id]
print(f"Latest post: {latest_id} — {latest_title}")

last_file = '.github/last_notified.txt'
try:
    with open(last_file) as f:
        last_notified = f.read().strip()
except:
    last_notified = ''

print(f"Last notified: {last_notified}")

if latest_id == last_notified:
    print("No new article. Nothing to send.")
    exit(0)

token = os.environ['AIRTABLE_TOKEN']
base  = os.environ['AIRTABLE_BASE_ID']
key   = os.environ['RESEND_API_KEY']
url   = 'https://iaseersobhan.github.io/i3-SkylineEconomicsWeekly/'

resp = requests.get(
    f'https://api.airtable.com/v0/{base}/Subscribers',
    headers={'Authorization': f'Bearer {token}'}
)
if not resp.ok:
    print(f"Airtable error: {resp.text}")
    exit(1)

emails = [
    r['fields']['Email']
    for r in resp.json().get('records', [])
    if r.get('fields', {}).get('Email')
]
print(f"{len(emails)} subscribers found")

if not emails:
    print("No subscribers yet — updating tracker.")
    with open(last_file, 'w') as f: f.write(latest_id)
    exit(0)

sent = 0
for email in emails:
    r = requests.post(
        'https://api.resend.com/emails',
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
        json={
            'from': 'I3 Skyline Economics <onboarding@resend.dev>',
            'to': email,
            'subject': f'New Article — {latest_title}',
            'html': f'''
<div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;background:#08080a;color:#ede9e0;padding:48px 40px;">
  <div style="margin-bottom:8px;">
    <span style="font-family:monospace;font-size:10px;color:#c8a45a;letter-spacing:3px;text-transform:uppercase;">New Article · I3 Skyline Economics Weekly</span>
  </div>
  <div style="border-left:2px solid #c8a45a;padding-left:20px;margin:24px 0 32px;">
    <h1 style="font-size:22px;font-weight:400;font-style:italic;color:#f8f5ee;margin:0;line-height:1.3;">{latest_title}</h1>
  </div>
  <a href="{url}" style="display:inline-block;background:#c8a45a;color:#08080a;padding:10px 22px;text-decoration:none;font-family:monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;">Read Article →</a>
  <p style="margin-top:48px;font-size:10px;color:#4a4840;font-family:monospace;border-top:1px solid #1e1e24;padding-top:20px;">
    I3 Skyline Economics Weekly · Independent commentary on economics, law &amp; property<br>
    <a href="{url}" style="color:#6b6860;">{url}</a>
  </p>
</div>
'''
        }
    )
    if r.ok:
        print(f"✓ {email}")
        sent += 1
    else:
        print(f"✗ {email}: {r.text}")

print(f"Sent {sent}/{len(emails)}")

with open(last_file, 'w') as f:
    f.write(latest_id)

#!/bin/bash
# Mole session viewer for xbar — refreshes every 30s
# Install: cp mole.30s.sh ~/Library/Application\ Support/xbar/plugins/

CONFIG="$HOME/.config/mole/sessions.json"

if [ ! -f "$CONFIG" ]; then
  echo "M"
  echo "---"
  echo "No sessions | color=#888"
  echo "Open Dashboard | shell=open | param1=-a | param2=Mole | terminal=false"
  exit 0
fi

python3 -c "
import json, sys

d = json.load(open('$HOME/.config/mole/sessions.json'))
sessions = d.get('sessions', [])
den_orders = d.get('den_orders', {})

# Build session_id -> den_name map
id_to_den = {}
for den_name, ids in den_orders.items():
    for sid in ids:
        id_to_den[sid] = den_name

# Header
print('M')
print('---')

if not sessions:
    print('No sessions | color=#888')
else:
    for s in sorted(sessions, key=lambda x: x.get('name','')):
        name = s.get('name', 'Unnamed')
        den = id_to_den.get(s.get('id',''), '—')
        label = f'{name}   [Den: {den}]'
        print(f'{label} | color=#ccc')

    print('---')

print('Open Dashboard | shell=open | param1=-a | param2=Mole | terminal=false')
print('Quit Mole | shell=pkill | param1=Mole | terminal=false')
"
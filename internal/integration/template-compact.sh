#!/bin/bash
# Mole compact template for xbar/SwiftBar — den groups + max 3 burrows + More

CONFIG="$HOME/.config/mole/sessions.json"
MOLE_ICON="iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAABmJLR0QA/wD/AP+gvaeTAAACdklEQVQ4jbWTT0hUURTGv3PvqDOjM2YNaTvTCrIMyqCCSAgi/6yiVVoREggKWZvQ9umqxKBFfyhokySEECoWBEGLFkF/EFtYWhvHJsOZ96Z5b+bN3NOiYRrfm+dMi77dd+79fve88+4F/pMo33SOfd6riNXMpZ3zAHBydH6bIHGeQPsZCGUDqwx+p1g9mr3SFAaA9lsLTYJJTA3smCsIvvBwyRuJJd+D+Klg8YGBEQYCLh3pivkqgAYi9Ehf/MCz3oOJgmAA6Bj7NAwWPQBkiV+dAakH0wO7r+UXhX2Xh2kcDLNEKMAwPUzj9rIDnFZoAaGyZDChMq3QUhRMQrSXDM2FqK0oGKSa8y2zAphd/Z8MmmGTA8xMNfl+cXK4enFyuNrNZ7XZzvE4OrbdBkuLSGZy9YUybuB1OtQ1FG/dFag4ut2/CQBe11+3Xi3Ek7EiuQ3BRxr95ZePHw4Kw0Cstw8gwrk7tz3dJ3wVoy9/aG++JFJuWefPy8pXLqivNRSQgqB0HfwrDo7rUJoOKQj9x0IBbxk5ZlK0461Bj/CVCQIAWVcL39luQBBkXW3u4Npgmfj2M5X5J3A4ainNVCroFQIAvKdPrVuPmUotRy3llncdRSrNfPNFRDcsxfY1I6X4xvOIbmXsF3rjjuMAqgBgbtm0+h8vr7XtqfLWb6mQALC0amZm53VTM1SuWwK0EsC8BFDuJWlGWj15G0049/2VAn+11wqMQsxsBCkkwc6MA1xpyrsE+l46llb8SXmvKHhisDHGUp4BIVyciTCk7JoYbHQ8RNcL3jnysYZ93osM1UEQDQD7s5EEQy0SxDQZ5v2poX1rhfK/AaGu8i3WrlDhAAAAAElFTkSuQmCC"

if [ ! -f "$CONFIG" ]; then
  echo " | image=$MOLE_ICON"
  echo "---"
  echo "No sessions | color=#888"
  echo "Open Dashboard | shell=open | param1=-a | param2=Mole | terminal=false"
  exit 0
fi

python3 -c "
import json, sys, os
from collections import defaultdict

MOLE_ICON = 'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAABmJLR0QA/wD/AP+gvaeTAAACdklEQVQ4jbWTT0hUURTGv3PvqDOjM2YNaTvTCrIMyqCCSAgi/6yiVVoREggKWZvQ9umqxKBFfyhokySEECoWBEGLFkF/EFtYWhvHJsOZ96Z5b+bN3NOiYRrfm+dMi77dd+79fve88+4F/pMo33SOfd6riNXMpZ3zAHBydH6bIHGeQPsZCGUDqwx+p1g9mr3SFAaA9lsLTYJJTA3smCsIvvBwyRuJJd+D+Klg8YGBEQYCLh3pivkqgAYi9Ehf/MCz3oOJgmAA6Bj7NAwWPQBkiV+dAakH0wO7r+UXhX2Xh2kcDLNEKMAwPUzj9rIDnFZoAaGyZDChMq3QUhRMQrSXDM2FqK0oGKSa8y2zAphd/Z8MmmGTA8xMNfl+cXK4enFyuNrNZ7XZzvE4OrbdBkuLSGZy9YUybuB1OtQ1FG/dFag4ut2/CQBe11+3Xi3Ek7EiuQ3BRxr95ZePHw4Kw0Cstw8gwrk7tz3dJ3wVoy9/aG++JFJuWefPy8pXLqivNRSQgqB0HfwrDo7rUJoOKQj9x0IBbxk5ZlK0461Bj/CVCQIAWVcL39luQBBkXW3u4Npgmfj2M5X5J3A4ainNVCroFQIAvKdPrVuPmUotRy3llncdRSrNfPNFRDcsxfY1I6X4xvOIbmXsF3rjjuMAqgBgbtm0+h8vr7XtqfLWb6mQALC0amZm53VTM1SuWwK0EsC8BFDuJWlGWj15G0049/2VAn+11wqMQsxsBCkkwc6MA1xpyrsE+l46llb8SXmvKHhisDHGUp4BIVyciTCk7JoYbHQ8RNcL3jnysYZ93osM1UEQDQD7s5EEQy0SxDQZ5v2poX1rhfK/AaGu8i3WrlDhAAAAAElFTkSuQmCC'

d = json.load(open(os.path.expanduser('~/.config/mole/sessions.json')))
sessions = d.get('sessions', [])

id_to_den = {}
for s in sessions:
    den = s.get('den', '')
    if den:
        id_to_den[s.get('id', '')] = den

den_sessions = defaultdict(list)
no_den = []
for s in sorted(sessions, key=lambda x: x.get('name', '')):
    den = id_to_den.get(s.get('id', ''), '')
    if den:
        den_sessions[den].append(s)
    else:
        no_den.append(s)

MAX_INLINE = 3

DEN_COLORS = {
    'mole': '#4A90D9',
    'huoshan': '#E85D3A',
}
def den_color(den_name):
    return DEN_COLORS.get(den_name, '#9B59B6')

def recent_sort_key(s):
    t = s.get('last_opened_at', '')
    return t if t else s.get('created_at', '')

print(f' | image={MOLE_ICON}')
print('---')

if den_sessions:
    for den_name in sorted(den_sessions.keys()):
        burrows = den_sessions[den_name]
        color = den_color(den_name)
        shown = burrows[:MAX_INLINE]
        rest_count = len(burrows) - MAX_INLINE
        print(f'{den_name} ({len(burrows)}) | color={color}')
        for b in shown:
            print(f'-- {b.get(\"name\", \"Unnamed\")} | color=#DDD')
        if rest_count > 0:
            print(f'-- More ({rest_count}) | color=#888')
        print(f'-- ---')
        print(f'-- Open {den_name} | shell=open | param1=-a | param2=Mole | terminal=false | color={color}')

if den_sessions and no_den:
    print('---')

if no_den:
    print(f'Burrows ({len(no_den)}) | color=#9B59B6')
    recent = sorted(no_den, key=recent_sort_key, reverse=True)[:MAX_INLINE]
    rest_count = len(no_den) - MAX_INLINE
    for b in recent:
        print(f'-- {b.get(\"name\", \"Unnamed\")} | color=#AAA')
    if rest_count > 0:
        print(f'-- More ({rest_count}) | color=#888')
    print(f'-- ---')
    print(f'-- Open Dashboard | shell=open | param1=-a | param2=Mole | terminal=false | color=#9B59B6')

print('---')
print('Open Dashboard | shell=open | param1=-a | param2=Mole | terminal=false | color=#4A90D9')
"
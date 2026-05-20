#!/bin/bash
# Mole minimal template for xbar/SwiftBar — icon + total count, dropdown shows den names only

CONFIG="$HOME/.config/mole/sessions.json"
MOLE_ICON="iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAABmJLR0QA/wD/AP+gvaeTAAACdklEQVQ4jbWTT0hUURTGv3PvqDOjM2YNaTvTCrIMyqCCSAgi/6yiVVoREggKWZvQ9umqxKBFfyhokySEECoWBEGLFkF/EFtYWhvHJsOZ96Z5b+bN3NOiYRrfm+dMi77dd+79fve88+4F/pMo33SOfd6riNXMpZ3zAHBydH6bIHGeQPsZCGUDqwx+p1g9mr3SFAaA9lsLTYJJTA3smCsIvvBwyRuJJd+D+Klg8YGBEQYCLh3pivkqgAYi9Ehf/MCz3oOJgmAA6Bj7NAwWPQBkiV+dAakH0wO7r+UXhX2Xh2kcDLNEKMAwPUzj9rIDnFZoAaGyZDChMq3QUhRMQrSXDM2FqK0oGKSa8y2zAphd/Z8MmmGTA8xMNfl+cXK4enFyuNrNZ7XZzvE4OrbdBkuLSGZy9YUybuB1OtQ1FG/dFag4ut2/CQBe11+3Xi3Ek7EiuQ3BRxr95ZePHw4Kw0Cstw8gwrk7tz3dJ3wVoy9/aG++JFJuWefPy8pXLqivNRSQgqB0HfwrDo7rUJoOKQj9x0IBbxk5ZlK0461Bj/CVCQIAWVcL39luQBBkXW3u4Npgmfj2M5X5J3A4ainNVCroFQIAvKdPrVuPmUotRy3llncdRSrNfPNFRDcsxfY1I6X4xvOIbmXsF3rjjuMAqgBgbtm0+h8vr7XtqfLWb6mQALC0amZm53VTM1SuWwK0EsC8BFDuJWlGWj15G0049/2VAn+11wqMQsxsBCkkwc6MA1xpyrsE+l46llb8SXmvKHhisDHGUp4BIVyciTCk7JoYbHQ8RNcL3jnysYZ93osM1UEQDQD7s5EEQy0SxDQZ5v2poX1rhfK/AaGu8i3WrlDhAAAAAElFTkSuQmCC"

if [ ! -f "$CONFIG" ]; then
  echo " | image=$MOLE_ICON"
  echo "---"
  echo "No sessions | color=#555"
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
for s in sessions:
    den = id_to_den.get(s.get('id', ''), '')
    if den:
        den_sessions[den].append(s)
    else:
        no_den.append(s)

total = len(sessions)
print(f' {total} | image={MOLE_ICON}')
print('---')

# Dens: only show den name + count, no burrow details
if den_sessions:
    print('Dens | color=#4A90D9')
    for den_name in sorted(den_sessions.keys()):
        count = len(den_sessions[den_name])
        print(f'-- {den_name} ({count}) | color=#333')
    print(f'-- ---')
    print(f'-- Open Dashboard | shell=open | param1=-a | param2=Mole | terminal=false | color=#4A90D9')

if den_sessions and no_den:
    print('---')

# Ungrouped: just count
if no_den:
    print(f'Burrows ({len(no_den)}) | color=#9B59B6')
    print(f'-- Open Dashboard | shell=open | param1=-a | param2=Mole | terminal=false | color=#9B59B6')

print('---')
print('Open Dashboard | shell=open | param1=-a | param2=Mole | terminal=false | color=#4A90D9')
"
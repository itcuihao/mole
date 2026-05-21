#!/bin/bash
# Mole compact template for xbar/SwiftBar — delegates to mole xbar CLI

MOLE_BIN="${MOLE_BIN:-}"
if [ -z "$MOLE_BIN" ]; then
    if command -v mole &>/dev/null; then
        MOLE_BIN="mole"
    elif [ -x "/usr/local/bin/mole" ]; then
        MOLE_BIN="/usr/local/bin/mole"
    elif [ -x "$HOME/.local/bin/mole" ]; then
        MOLE_BIN="$HOME/.local/bin/mole"
    fi
fi

if [ -z "$MOLE_BIN" ]; then
    MOLE_ICON="iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAABmJLR0QA/wD/AP+gvaeTAAACdklEQVQ4jbWTT0hUURTGv3PvqDOjM2YNaTvTCrIMyqCCSAgi/6yiVVoREggKWZvQ9umqxKBFfyhokySEECoWBEGLFkF/EFtYWhvHJsOZ96Z5b+bN3NOiYRrfm+dMi77dd+79fve88+4F/pMo33SOfd6riNXMpZ3zAHBydH6bIHGeQPsZCGUDqwx+p1g9mr3SFAaA9lsLTYJJTA3smCsIvvBwyRuJJd+D+Klg8YGBEQYCLh3pivkqgAYi9Ehf/MCz3oOJgmAA6Bj7NAwWPQBkiV+dAakH0wO7r+UXhX2Xh2kcDLNEKMAwPUzj9rIDnFZoAaGyZDChMq3QUhRMQrSXDM2FqK0oGKSa8y2zAphd/Z8MmmGTA8xMNfl+cXK4enFyuNrNZ7XZzvE4OrbdBkuLSGZy9YUybuB1OtQ1FG/dFag4ut2/CQBe11+3Xi3Ek7EiuQ3BRxr95ZePHw4Kw0Cstw8gwrk7tz3dJ3wVoy9/aG++JFJuWefPy8pXLqivNRSQgqB0HfwrDo7rUJoOKQj9x0IBbxk5ZlK0461Bj/CVCQIAWVcL39luQBBkXW3u4Npgmfj2M5X5J3A4ainNVCroFQIAvKdPrVuPmUotRy3llncdRSrNfPNFRDcsxfY1I6X4xvOIbmXsF3rjjuMAqgBgbtm0+h8vr7XtqfLWb6mQALC0amZm53VTM1SuWwK0EsC8BFDuJWlGWj15G0049/2VAn+11wqMQsxsBCkkwc6MA1xpyrsE+l46llb8SXmvKHhisDHGUp4BIVyciTCk7JoYbHQ8RNcL3jnysYZ93osM1UEQDQD7s5EEQy0SxDQZ5v2poX1rhfK/AaGu8i3WrlDhAAAAAElFTkSuQmCC"
    echo " | image=$MOLE_ICON"
    echo "---"
    echo "mole not found in PATH | color=#E85D3A"
    echo "Install mole CLI | shell=open param1=-a param2=Mole terminal=false"
    exit 0
fi

exec "$MOLE_BIN" xbar --template compact
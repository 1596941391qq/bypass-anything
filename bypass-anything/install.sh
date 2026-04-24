#!/usr/bin/env bash
# bypass-anything installer
# Usage: cd bypass-anything && bash install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "=== bypass-anything installer ==="
echo "Working dir: $SCRIPT_DIR"

# 1. Install Node.js dependencies
echo ""
echo "[1/4] Installing Node.js dependencies..."
cd "$SCRIPT_DIR"
npm install
echo "  OK: ws dependency installed"

# 2. Check Chrome
echo ""
echo "[2/4] Checking Chrome installation..."
CHROME_FOUND=false
if [[ "$OSTYPE" == "darwin"* ]]; then
  CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if [ -f "$CHROME_PATH" ]; then
    CHROME_FOUND=true
    echo "  OK: Chrome found at $CHROME_PATH"
  fi
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
  CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"
  if [ -f "$CHROME_PATH" ]; then
    CHROME_FOUND=true
    echo "  OK: Chrome found at $CHROME_PATH"
  fi
else
  if command -v google-chrome &>/dev/null; then
    CHROME_FOUND=true
    echo "  OK: google-chrome in PATH"
  elif command -v chromium-browser &>/dev/null; then
    CHROME_FOUND=true
    echo "  OK: chromium-browser in PATH"
  fi
fi

if [ "$CHROME_FOUND" = false ]; then
  echo "  WARNING: Chrome not found. Install Google Chrome for CDP features."
fi

# 3. Check FlareSolverr (optional)
echo ""
echo "[3/4] Checking FlareSolverr (optional)..."
if curl -s --max-time 3 http://localhost:8191/ > /dev/null 2>&1; then
  echo "  OK: FlareSolverr running on port 8191"
else
  echo "  SKIP: FlareSolverr not running (optional for CF bypass)"
  echo "  To enable: docker run -d -p 8191:8191 ghcr.io/flaresolverr/flaresolverr"
fi

# 4. Check CAPTCHA API keys (optional)
echo ""
echo "[4/4] Checking CAPTCHA API keys (optional)..."
KEYS_FOUND=0
for KEY_VAR in CAPTCHA_2CAPTCHA_KEY CAPTCHA_CAPSOLVER_KEY CAPTCHA_ANTICAPTCHA_KEY; do
  if [ -n "${!KEY_VAR}" ]; then
    echo "  OK: $KEY_VAR set"
    KEYS_FOUND=$((KEYS_FOUND + 1))
  fi
done
if [ $KEYS_FOUND -eq 0 ]; then
  echo "  SKIP: No CAPTCHA API keys set (Turnstile works without keys)"
  echo "  To enable: export CAPTCHA_2CAPTCHA_KEY=your_key"
fi

# Summary
echo ""
echo "=== Installation Complete ==="
echo ""
echo "Quick start:"
echo "  1. Launch Chrome with CDP:"
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo '     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-bypass &'
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
  echo '     "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=C:\chrome-bypass &'
else
  echo '     google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-bypass &'
fi
echo ""
echo "  2. Test connection:"
echo "     node $SCRIPT_DIR/scripts/cdp-submit.mjs https://example.com"
echo ""
echo "  3. Use from Claude Code:"
echo "     Copy this directory to ~/.claude/skills/bypass-anything/"
echo "     or add to your project's .claude/skills/"

# hermes-tweet

Hermes Tweet is a native [Hermes Agent](https://github.com/NousResearch/hermes-agent)
plugin for X/Twitter automation through [Xquik](https://xquik.com). It exposes
read-first social search, account context, trend, monitor, media, draw, and
workflow tools, with account-changing actions disabled unless explicitly
enabled in the Hermes runtime.

## Install

```bash
hermes plugins install Xquik-dev/hermes-tweet --enable
```

Hermes prompts for `XQUIK_API_KEY` during an interactive install. Without that
key, the plugin exposes only the local `tweet_explore` catalog tool. Write-like
and private account routes stay hidden unless `HERMES_TWEET_ENABLE_ACTIONS=true`
is set for the trusted runtime session.

If a non-interactive install skips the key prompt, set `XQUIK_API_KEY` in the
runtime environment or `~/.hermes/.env`. Run `/reload` in an interactive
session, or restart gateway and cron sessions after changing that file.

Use the upstream guide for the current tool list, environment settings, and
Hermes Desktop or gateway setup:

- [Hermes Tweet README](https://github.com/Xquik-dev/hermes-tweet#readme)
- [PyPI package](https://pypi.org/project/hermes-tweet/)

Xquik is an independent third-party service. Not affiliated with X Corp.
"Twitter" and "X" are trademarks of X Corp.

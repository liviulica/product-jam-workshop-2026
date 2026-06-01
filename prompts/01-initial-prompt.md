# 01 · Initial Prompt

The original request that kicked off the project. Given verbatim to Claude Code in a
session started in `product-jam/`, it asked Claude to explore the repo and propose the
prompt/architecture. Its outputs are captured in [02-generated-prompts.md](02-generated-prompts.md)
and [03-plan.md](03-plan.md).

```text
We will be working on Handy. I want you to build for it a portal, which runs on local, in this folder.
The purpose of the portal is:
1. Release notes - by default it shows the last week. Looks at the PRs and make a human readable summary, a list of PRs with the ids, links to them, date, author, description. At the end there is a leader board of the builders.
2. Documentation based on the code. We will analyse the code and we will create a documentation portal, accessible from the tool.
3. Prioritisation of open issue based on a few cattegories: comments, severity and perceived priority.
4. News about the competition.

---
The portal will update this on / commands that live locaaly in this project. the command will start with /h: . So you have a / command to update the release notes with the lates a command to review the code and update, same for prioritisation and for the competition.
There is also a /h:update-all that runs all commands.

---
Look at the repo and think of how you would structure the prompt and give me the prompt to do this.
```

const { spawn } = require("child_process");

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdout.write("\x1B[?1049h");

// mode: "menu" | "results" | "compose"
let mode = "menu";
let cursor = 0;
let items = [];
let loading = false;
let statusMessage = "";
let lastCommandIndex = null; // which COMMANDS entry produced the current results

// ---- compose (multi-field text input) state ----
let composeFields = []; // [{ name, prompt }]
let composeIndex = 0;
let composeValues = {};
let composeBuffer = "";
let composeTitle = "";
let composeOnSubmit = null; // async (values) => void

// Runs a gogcli command and parses its JSON output.
function runGog(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("gog", args);
    let out = "";
    let err = "";

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));

    child.on("error", (e) => reject(e)); // e.g. gog not installed / not on PATH
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(err.trim() || `gog exited with code ${code}`));
      }
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        resolve(out); // fall back to raw text if it wasn't JSON
      }
    });
  });
}

// Each entry is one selectable command from the start menu.
const COMMANDS = [
  {
    label: "Gmail — unread messages",
    args: ["gmail", "search", "is:unread", "--max", "15", "--json"],
    parse: (data) =>
      (data.threads || []).map((m) => ({
        title: `${m.from || m.sender || "Unknown"} — ${m.subject || "(no subject)"}`,
      })),
  },
  {
    label: "Calendar — today's events",
    args: ["calendar", "events", "--today", "--json"],
    parse: (data) =>
      (data.events || data || []).map((e) => ({
        title: `${e.start?.dateTime || e.start?.date || ""}  ${
          e.summary || "(untitled event)"
        }`,
      })),
    },
  {
    label: "Drive — recent files",
    args: ["drive", "ls", "--max", "15", "--json"],
    parse: (data) =>
      (data.files || data || []).map((f) => ({
        title: `${f.name || "(untitled)"}  [${f.mimeType || ""}]`,
      })),
  },
];

async function runCommand(cmdIndex) {
  const cmd = COMMANDS[cmdIndex];
  loading = true;
  mode = "results";
  lastCommandIndex = cmdIndex;
  statusMessage = `Running: gog ${cmd.args.join(" ")}`;
  render();
  try {
    const data = await runGog(cmd.args);
    items = cmd.parse(data);
    statusMessage = `Done — ${items.length} result(s)`;
  } catch (e) {
    statusMessage = `Error: ${e.message}`;
    items = [];
  }
  loading = false;
  render();
}

// ---- compose helpers ----

function startCompose(title, fields, onSubmit) {
  composeTitle = title;
  composeFields = fields;
  composeIndex = 0;
  composeValues = {};
  composeBuffer = "";
  composeOnSubmit = onSubmit;
  mode = "compose";
  render();
}

async function submitCompose() {
  const values = composeValues;
  mode = "results";
  loading = true;
  statusMessage = "Submitting...";
  render();
  try {
    await composeOnSubmit(values);
  } catch (e) {
    statusMessage = `Error: ${e.message}`;
    loading = false;
    render();
    return;
  }
  loading = false;
  render();
}

function startSendEmail() {
  startCompose(
    "Send an email",
    [
      { name: "to", prompt: "To (email address)" },
      { name: "subject", prompt: "Subject" },
      { name: "body", prompt: "Body" },
    ],
    async (values) => {
      await runGog([
        "gmail",
        "send",
        "--to",
        values.to,
        "--subject",
        values.subject,
        "--body",
        values.body,
      ]);
      items = [];
      lastCommandIndex = 0; // back to gmail context
      statusMessage = `Email sent to ${values.to}`;
    },
  );
}

function startAddEvent() {
  startCompose(
    "Add a calendar event",
    [
      { name: "summary", prompt: "Event title" },
      { name: "date", prompt: "Date (YYYY-MM-DD)" },
      { name: "startTime", prompt: "Start time (HH:MM, 24h)" },
      { name: "endTime", prompt: "End time (HH:MM, 24h)" },
    ],
    async (values) => {
      const from = `${values.date}T${values.startTime}:00+05:30`;
      const to = `${values.date}T${values.endTime}:00+05:30`;

      await runGog([
        "calendar",
        "create",
        "primary",
        "--summary",
        values.summary,
        "--from",
        from,
        "--to",
        to,
      ]);

      items = [];
      lastCommandIndex = 1;
      statusMessage = `Event "${values.summary}" created for ${values.date}`;
    },
  );
}

// ---- rendering ----

function render() {
  process.stdout.write("\x1B[1J\x1B[H"); // clear screen, cursor to top-left

  if (mode === "menu") {
    process.stdout.write("Select a command:\n\n");
    COMMANDS.forEach((cmd, i) => {
      const prefix = i === cursor ? "> " : "  ";
      process.stdout.write(`${prefix}${cmd.label}\n`);
    });
    process.stdout.write("\n" + "-".repeat(50) + "\n");
    process.stdout.write("[↑/↓] navigate   [Enter] run   [q] quit\n");
    return;
  }

  if (mode === "results") {
    if (loading) {
      process.stdout.write(`${statusMessage}\n`);
      return;
    }

    if (items.length === 0) {
      process.stdout.write("(no results)\n");
    } else {
      items.forEach((item) => process.stdout.write(`  ${item.title}\n`));
    }

    process.stdout.write("\n" + "-".repeat(50) + "\n");
    process.stdout.write(`${statusMessage}\n`);

    const extra = [];
    if (lastCommandIndex === 0) extra.push("[s] send email");
    if (lastCommandIndex === 1) extra.push("[a] add event");
    extra.push("[Esc] back", "[q] quit");
    process.stdout.write(extra.join("   ") + "\n");
    return;
  }

  if (mode === "compose") {
    process.stdout.write(`${composeTitle}\n\n`);

    // already-filled fields
    for (let i = 0; i < composeIndex; i++) {
      process.stdout.write(
        `${composeFields[i].prompt}: ${composeValues[composeFields[i].name]}\n`,
      );
    }

    // current field being typed
    const current = composeFields[composeIndex];
    process.stdout.write(`${current.prompt}: ${composeBuffer}\n`);

    process.stdout.write("\n" + "-".repeat(50) + "\n");
    process.stdout.write("[Enter] next   [Esc] cancel\n");
  }
}

// ---- input handling ----

process.stdin.on("data", (data) => {
  // Ctrl+C always quits
  if (data[0] === 0x03) {
    process.exit(0);
  }

  if (mode === "menu") {
    if (data.toString() === "q") process.exit(0);

    if (data[0] === 0x1b && data[1] === 0x5b) {
      if (data[2] === 0x41) {
        cursor = Math.max(0, cursor - 1);
        render();
      }
      if (data[2] === 0x42) {
        cursor = Math.min(COMMANDS.length - 1, cursor + 1);
        render();
      }
      return;
    }

    if (data[0] === 0x0d) {
      runCommand(cursor);
    }
    return;
  }

  if (mode === "results") {
    if (loading) return; // ignore input while a command is running

    if (data.toString() === "q") process.exit(0);

    // Esc goes back to the menu
    if (data.length === 1 && data[0] === 0x1b) {
      mode = "menu";
      items = [];
      render();
      return;
    }

    if (data.toString() === "s" && lastCommandIndex === 0) {
      startSendEmail();
      return;
    }

    if (data.toString() === "a" && lastCommandIndex === 1) {
      startAddEvent();
      return;
    }
    return;
  }

  if (mode === "compose") {
    // Esc cancels back to results
    if (data.length === 1 && data[0] === 0x1b) {
      mode = "results";
      statusMessage = "Cancelled";
      render();
      return;
    }

    // Backspace
    if (data[0] === 0x7f || data[0] === 0x08) {
      composeBuffer = composeBuffer.slice(0, -1);
      render();
      return;
    }

    // Enter: save current field, move to next, or submit if last field
    if (data[0] === 0x0d) {
      const field = composeFields[composeIndex];
      composeValues[field.name] = composeBuffer;
      composeBuffer = "";
      composeIndex++;

      if (composeIndex >= composeFields.length) {
        submitCompose();
      } else {
        render();
      }
      return;
    }

    // Ignore other control/escape sequences, accept normal typed characters
    if (data[0] >= 0x20 && data[0] < 0x7f) {
      composeBuffer += data.toString();
      render();
    }
  }
});

// initial screen: the command menu
render();

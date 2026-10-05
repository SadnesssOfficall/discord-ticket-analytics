# discord-ticket-analytics

Analyze support ticket data from JSON, CSV or a Discord server, from the command line or from code.

## Description

`discord-ticket-analytics` reads tickets (who opened them, who answered, when, in which category),
validates the data strictly, and computes response times, workload per staff member, busiest hours
and daily, weekly and monthly statistics. Results can be printed as a table, JSON or CSV, or written
as a single standalone HTML report with SVG charts and no external resources.

## Features

- Import from JSON or CSV with an own RFC 4180 CSV parser (quotes, multi-line fields, escaped
  quotes, BOM, CRLF)
- Strict validation with file and line numbers: invalid ISO timestamps, `closedAt` before
  `createdAt`, duplicate ids, wrong roles, oversized files
- First response time (average, median, p90): from the user's first message to the first staff
  message; bot messages never count
- Average resolution time, open and closed counts, tickets without a staff reply
- Tickets and average first response time per staff member, tickets per category
- Busiest hours in any IANA time zone (via `Intl`, DST-aware)
- Daily, weekly (ISO 8601 weeks) and monthly statistics, plus a creation date range filter
- Output as terminal table, `--json` or `--csv`
- `report` command: one static HTML file, CSS and SVG only, every value HTML-escaped
- `TicketSource` interface with a file source and a discord.js based Discord source
- Pure functions in the calculation core, usable as a library

## Installation

Requires Node.js 20 or newer. The package is not published to npm yet; build it from source:

```sh
git clone https://github.com/SadnesssOfficall/discord-ticket-analytics.git
cd discord-ticket-analytics
npm install
npm run build
node dist/cli/bin.js --help
```

The Discord source needs `discord.js` v14, which is an optional peer dependency. Install it next
to this package only if you use `--discord`:

```sh
npm install discord.js
```

Without it, `--discord` fails with a message that tells you to install it. File sources never load it.

## Usage

```text
discord-ticket-analytics analyze  <tickets.json | tickets.csv> [-m <messages.csv>] [options] [--json | --csv]
discord-ticket-analytics report   <tickets.json | tickets.csv> [-m <messages.csv>] -o <report.html> [--force] [--title <text>] [options]
discord-ticket-analytics validate <tickets.json | tickets.csv> [-m <messages.csv>] [--max-bytes <n>]
discord-ticket-analytics <command> --discord --category <id> --staff-role <id>... [options]
```

| Option                  | Meaning                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `-m, --messages <file>` | Messages CSV that belongs to a tickets CSV                        |
| `--max-bytes <n>`       | Largest input file accepted (default 52428800, 50 MiB)            |
| `-z, --timezone <zone>` | IANA time zone for hours and periods (default `UTC`)              |
| `--from <date or time>` | Only tickets created at or after this moment                      |
| `--to <date or time>`   | Only tickets created before this moment                           |
| `--peak-hours <n>`      | How many busiest hours to list (default 3)                        |
| `--json`, `--csv`       | Machine readable output instead of the table (mutually exclusive) |
| `-o, --output <file>`   | Report file; an existing file is only replaced with `--force`     |

`--from` and `--to` accept `2026-03-01` (midnight UTC) or a full timestamp with a zone such as
`2026-03-01T00:00:00+03:00`.

Exit codes: `0` success, `1` the ticket data is invalid, `2` usage, file or Discord error.

### Data formats

JSON is an array of tickets:

```json
{
  "id": "1001",
  "createdAt": "2026-03-02T09:00:00Z",
  "closedAt": "2026-03-02T11:00:00Z",
  "user": "alice",
  "staff": "mod_jo",
  "category": "billing",
  "status": "closed",
  "messages": [{ "author": "alice", "authorRole": "user", "timestamp": "2026-03-02T09:00:00Z" }]
}
```

CSV uses two files because messages are a one-to-many relation. Both need a header row, columns may
appear in any order, unknown columns are ignored.

`tickets.csv`: `id`, `createdAt`, `closedAt` (optional), `user`, `staff` (optional), `category`, `status`

`messages.csv` (passed with `-m`): `ticketId`, `author`, `authorRole`, `timestamp`

Rules, enforced for both formats:

- `status` is `open`, `pending` or `closed`; `authorRole` is `user`, `staff` or `bot`
- timestamps are ISO 8601 and must carry a time zone (`Z` or an offset)
- `closedAt` is required for closed tickets, forbidden otherwise, and not earlier than `createdAt`
- message timestamps may not be earlier than the ticket's `createdAt`
- ids are unique; text fields are at most 256 characters and contain no control or bidirectional
  characters
- a ticket without `staff` is attributed to the author of its first staff message

## Configuration

There is no configuration file. Everything is a command line option (see above). Discord options:

| Option                   | Meaning                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `--discord`              | Read from Discord instead of a file                                 |
| `--category <id>`        | Category whose text channels are open tickets                       |
| `--closed-category <id>` | Category whose text channels are closed tickets (optional)          |
| `--staff-role <id>`      | Role that marks staff members, repeatable, at least one is required |
| `--token-env <NAME>`     | Name of the environment variable that holds the bot token           |
| `--max-channels <n>`     | Ticket channel limit (default 1000)                                 |
| `--max-messages <n>`     | Messages per channel limit (default 10000)                          |

The token is read only from an environment variable (`DISCORD_TOKEN` by default). `--token-env`
takes the variable's name; a value that does not look like a variable name is rejected so a pasted
token never ends up in shell history or an error message.

How Discord channels map to tickets: every text channel in the category is a ticket. Its id is the
channel id, `createdAt` is the channel creation time, `category` is the category name, and the
user is the author of the first non-staff, non-bot message. Authors are `bot` if Discord marks them
as bots, `staff` if their member has one of the staff roles, otherwise `user`. Channels in the closed
category are `closed` and use their last message as `closedAt`. The bot needs the View Channels and
Read Message History permissions, and members of the guild are looked up to check their roles.

## Examples

The `examples` directory holds a small data set.

```sh
node dist/cli/bin.js validate examples/tickets.csv -m examples/messages.csv
node dist/cli/bin.js analyze examples/tickets.csv -m examples/messages.csv -z Europe/Istanbul
node dist/cli/bin.js analyze examples/tickets.json --json
node dist/cli/bin.js analyze examples/tickets.csv -m examples/messages.csv --csv --from 2026-03-03
node dist/cli/bin.js report examples/tickets.csv -m examples/messages.csv -o report.html --title "March support"
```

Excerpt of the table output for the CSV example:

```text
Summary
Metric                        Value
------------------------  ---------
Tickets                           4
Open                              2
Closed                            2
Answered by staff                 3
Without staff response            1
First response, average      30m 0s
First response, median       20m 0s
First response, p90        1h 0m 0s
```

Library use:

```ts
import { FileTicketSource, analyze, renderHtmlReport } from 'discord-ticket-analytics';

const tickets = await new FileTicketSource({ path: 'tickets.json' }).load();
const analysis = analyze(tickets, { timeZone: 'Europe/Istanbul' });
console.log(analysis.firstResponse.medianMs);
const html = renderHtmlReport(analysis, 'Support report');
```

Discord source from code (set `DISCORD_TOKEN` in the environment, never hard-code it):

```ts
import { DiscordTicketSource } from 'discord-ticket-analytics';

const source = new DiscordTicketSource({
  token: process.env.DISCORD_TOKEN ?? '',
  categoryId: '123456789012345678',
  staffRoleIds: ['234567890123456789'],
});
const tickets = await source.load();
```

Any object with `load(): Promise<Ticket[]>` is a valid `TicketSource`.

## Architecture

```text
src/
  model.ts           Ticket types and limits
  timestamp.ts       Strict ISO 8601 parsing
  validate.ts        Schema validation shared by JSON, CSV and Discord input
  import/            CSV parser, JSON and CSV importers, bounded file reading
  sources/           TicketSource, file source, Discord source (+ discord.js loader)
  stats/             Pure calculation core: math, response times, time zones, analyze
  output/            Table, CSV, HTML report and SVG charts
  cli/               Argument parsing and commands
```

All importers produce raw records that go through one validator, so every source gets the same
rules and the same error format. `analyze` takes tickets and options and returns a plain object;
it does not read files, the clock or the environment. Output renderers only consume that object.

First response time is measured from the user's first message to the first staff message at or after
it. Percentiles use the nearest-rank method. Hours, days, ISO weeks and months are computed in the
requested time zone, so a ticket created at 23:30 UTC belongs to the next day in Tokyo, and the
nonexistent hour during a spring-forward transition stays empty.

## Security

- **Secrets:** the Discord token comes only from an environment variable, is never printed, and is
  replaced by `[redacted]` if a client error message happens to contain it.
- **Input validation:** inputs are checked before any statistics are computed; the number of problems
  shown is capped, and error messages quote locations, not file contents.
- **Bounded input:** files above 50 MiB (configurable), non-regular files and invalid UTF-8 are
  refused; at most 100000 tickets and 10000 messages per ticket are accepted; the Discord source
  enforces channel and message limits.
- **Hostile text:** names with control or bidirectional characters are rejected, so a ticket file
  cannot rewrite your terminal.
- **HTML report:** every dynamic value is escaped, there is no JavaScript and no external resource,
  and a Content-Security-Policy meta tag (`default-src 'none'`, inline style by hash) backs that up.
- **CSV output:** cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheets do
  not run them as formulas.
- **Safe writes:** `report` refuses to overwrite files without `--force` and never overwrites one of
  its input files.
- **Discord rate limits:** the source fetches sequentially in pages of 100 messages and relies on
  discord.js, whose REST client queues requests and waits when Discord reports a rate limit.

## Performance

Measured on one Windows machine with Node.js 25, not a benchmark suite: `analyze` over 50000
generated tickets with two messages each took about 350 ms, and `validate` of a 3.5 MB, 50000 row CSV
file took about 0.45 s including process start. Your numbers will differ.

## Development

```sh
npm install
npm run build
```

| Script                 | Purpose             |
| ---------------------- | ------------------- |
| `npm run build`        | Compile to `dist/`  |
| `npm run lint`         | ESLint (type-aware) |
| `npm run format:check` | Prettier            |
| `npm run typecheck`    | `tsc --noEmit`      |
| `npm test`             | Vitest              |

## Testing

```sh
npm test
```

Tests cover the CSV parser (quotes, multi-line fields, CRLF, BOM, malformed input), validation
errors with line numbers, statistics against small hand-calculated data sets (open and closed
tickets, unanswered tickets, bot messages, time zones, DST transitions, ISO week and year
boundaries), the CLI including exit codes, and XSS payloads in the HTML report.

**The Discord source is not tested against the real Discord API.** Its tests inject a fake client
that imitates the parts of discord.js the source uses, so they check this package's logic (paging,
role mapping, limits, token redaction) and not discord.js or Discord itself. A live test exists in
`tests/discord-cli.test.ts`; it is skipped unless `DISCORD_TOKEN`, `DISCORD_TEST_CATEGORY_ID` and
`DISCORD_TEST_STAFF_ROLE_ID` are set, and it needs `discord.js` installed.

## License

[MIT](LICENSE)

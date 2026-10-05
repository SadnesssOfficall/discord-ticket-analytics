# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-05

### Added

- `analyze`, `report` and `validate` commands
- JSON and CSV import with an RFC 4180 CSV parser and located validation errors
- First response time (average, median, p90), resolution time, per staff, per category, busiest hours
- Daily, ISO weekly and monthly statistics with time zone and date range options
- Table, JSON and CSV output, and a standalone HTML report with SVG charts
- `TicketSource` interface with file and discord.js based Discord sources
- Library API

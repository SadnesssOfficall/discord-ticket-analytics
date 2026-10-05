export interface DataIssue {
  location: string;
  message: string;
}

export class TicketDataError extends Error {
  override name = 'TicketDataError';
  readonly issues: readonly DataIssue[];
  readonly omitted: number;

  constructor(issues: readonly DataIssue[], omitted = 0) {
    const lines = issues.map((issue) => `${issue.location}: ${issue.message}`);
    if (omitted > 0) lines.push(`... and ${omitted} more problem(s) not shown`);
    super(lines.join('\n'));
    this.issues = issues;
    this.omitted = omitted;
  }
}

export class SourceError extends Error {
  override name = 'SourceError';
}

export class OptionError extends Error {
  override name = 'OptionError';
}

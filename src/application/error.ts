export class ApplicationError extends Error { public constructor(public readonly code: string, message: string, public readonly cause?: unknown) { super(message); this.name = "ApplicationError"; } }

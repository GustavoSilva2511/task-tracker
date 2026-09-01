/**
 * An error whose message is safe and useful to show directly to the user.
 * Anything else that escapes to the top level is treated as an unexpected bug.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

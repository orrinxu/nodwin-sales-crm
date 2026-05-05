export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message)
    this.name = "ForbiddenError"
  }
}

export class UnauthorisedError extends Error {
  constructor(message = "Unauthorised") {
    super(message)
    this.name = "UnauthorisedError"
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BadRequestError"
  }
}

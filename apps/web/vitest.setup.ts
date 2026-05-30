/// <reference types="vitest/globals" />
import "@testing-library/jest-dom"
import "@testing-library/jest-dom/vitest"

vi.mock("server-only", () => ({}))

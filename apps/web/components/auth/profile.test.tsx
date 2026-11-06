import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { Profile } from "./profile";

// Form data never reaches the console (spec 0011, AC-19). Saving itself is not built yet.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const LEVELS = ["log", "info", "warn", "error", "debug"] as const;

function consoleText(spies: ReturnType<typeof vi.spyOn>[]) {
  return inspect(
    spies.flatMap((spy) => spy.mock.calls),
    { depth: 5 },
  );
}

describe("Profile form logging (AC-19)", () => {
  let spies: ReturnType<typeof vi.spyOn>[];

  beforeEach(() => {
    vi.clearAllMocks();
    spies = LEVELS.map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves personal info without logging the name", async () => {
    const user = userEvent.setup();
    render(<Profile user={{ name: "Ada Lovelace", email: "ada@example.com" }} />);

    await user.click(screen.getByRole("button", { name: "Save Personal Info" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled(), { timeout: 3_000 });
    expect(consoleText(spies)).not.toContain("Lovelace");
  });

  it("saves professional info without logging what was typed", async () => {
    const user = userEvent.setup();
    render(<Profile user={{ name: "Ada Lovelace" }} />);

    await user.type(screen.getByPlaceholderText("Tell us about yourself..."), "private bio text");
    await user.click(screen.getByRole("button", { name: /Save Professional/ }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled(), { timeout: 3_000 });
    expect(consoleText(spies)).not.toContain("private bio text");
  });
});

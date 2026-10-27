import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SocialProvider } from "@aft/auth/providers";

import { SocialButtons } from "./social-buttons";

describe("SocialButtons", () => {
  it("A11: renders nothing when no provider is configured (AC-4)", () => {
    const { container } = render(
      <SocialButtons providers={[]} disabled={false} onSelect={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("A11: ignores a provider name it has no button for", () => {
    const { container } = render(
      <SocialButtons
        providers={["twitter" as SocialProvider]}
        disabled={false}
        onSelect={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("A11: labels the buttons exactly Google and Github, in the order given (AC-4)", () => {
    render(<SocialButtons providers={["google", "github"]} disabled={false} onSelect={vi.fn()} />);

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Google",
      "Github",
    ]);
  });

  it("uses plain buttons, so a click never submits the surrounding form", () => {
    render(<SocialButtons providers={["google", "github"]} disabled={false} onSelect={vi.fn()} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });

  it("calls onSelect with the provider that was clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SocialButtons providers={["google", "github"]} disabled={false} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: "Github" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("github");
  });

  it("disables every button and ignores clicks while disabled", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SocialButtons providers={["google", "github"]} disabled onSelect={onSelect} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    await user.click(screen.getByRole("button", { name: "Google" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("can be reached and used with the keyboard alone", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SocialButtons providers={["google", "github"]} disabled={false} onSelect={onSelect} />);

    await user.tab();
    expect(screen.getByRole("button", { name: "Google" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Github" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("github");
  });
});

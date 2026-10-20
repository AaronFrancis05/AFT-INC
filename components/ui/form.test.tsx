import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "./form";
import { Input } from "./input";

type Values = { email: string; name: string };

function TestForm({ message, showMessage = true }: { message?: string; showMessage?: boolean }) {
  const form = useForm<Values>({ defaultValues: { email: "", name: "" } });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})}>
        <FormField
          control={form.control}
          name="email"
          rules={{ required: "Email is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input aria-describedby="email-hint" {...field} />
              </FormControl>
              <p id="email-hint">Email hint</p>
              {showMessage && <FormMessage>{message}</FormMessage>}
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          rules={{ required: "Name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input type="password" {...field} />
                  <button type="button">Show password</button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit">Submit</button>
      </form>
    </Form>
  );
}

describe("FormMessage", () => {
  it("renders nothing before the form is validated", () => {
    render(<TestForm />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-describedby");
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Email hint");
  });

  it("shows the validation error of its own field as an alert", async () => {
    const user = userEvent.setup();
    render(<TestForm />);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((alert) => alert.textContent)).toEqual(["Email is required", "Name is required"]);
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Name");
    expect(email.id).not.toBe(password.id);
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Email hint Email is required");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAttribute("aria-describedby", alerts[1].id);
    expect(password).toHaveAccessibleDescription("Name is required");
    expect(password.parentElement).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "Show password" })).not.toHaveAttribute("aria-describedby");
  });

  it("clears a field's error once that field becomes valid", async () => {
    const user = userEvent.setup();
    render(<TestForm />);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Name is required");
    const originalId = screen.getByLabelText("Name").id;

    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
    expect(screen.getByLabelText("Name").id).toBe(originalId);
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("aria-describedby");
  });

  it("shows explicit children instead of the field error", async () => {
    const user = userEvent.setup();
    render(<TestForm message="Use your work email" />);
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Email hint Use your work email");

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Use your work email")).toBeInTheDocument();
    expect(screen.queryByText("Email is required")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Email hint Use your work email");
  });

  it("does not describe an error when explicit empty children suppress the message", async () => {
    const user = userEvent.setup();
    render(<TestForm message="" />);
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Email hint");
    expect(screen.queryByText("Email is required")).not.toBeInTheDocument();
  });

  it("removes the message reference when an explicit message unmounts", () => {
    const { rerender } = render(<TestForm message="Use your work email" />);
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAccessibleDescription("Email hint Use your work email");

    rerender(<TestForm message="Use your work email" showMessage={false} />);
    expect(email).toHaveAttribute("aria-describedby", "email-hint");
  });
});

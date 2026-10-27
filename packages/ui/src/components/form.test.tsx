import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Form, FormField, FormItem, FormMessage } from "./form";

type Values = { email: string; name: string };

function TestForm({ message }: { message?: string }) {
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
              <input aria-label="Email" {...field} />
              <FormMessage>{message}</FormMessage>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="name"
          rules={{ required: "Name is required" }}
          render={({ field }) => (
            <FormItem>
              <input aria-label="Name" {...field} />
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
  });

  it("shows the validation error of its own field as an alert", async () => {
    const user = userEvent.setup();
    render(<TestForm />);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      "Email is required",
      "Name is required",
    ]);
  });

  it("clears a field's error once that field becomes valid", async () => {
    const user = userEvent.setup();
    render(<TestForm />);
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Name is required");

    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
    expect(screen.getByText("Email is required")).toBeInTheDocument();
  });

  it("shows explicit children instead of the field error", async () => {
    const user = userEvent.setup();
    render(<TestForm message="Use your work email" />);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Use your work email")).toBeInTheDocument();
    expect(screen.queryByText("Email is required")).not.toBeInTheDocument();
  });
});

"use client";

import * as React from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

export const Form = FormProvider;

const FormFieldContext = React.createContext<{ name: string; id: string } | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  const id = React.useId();
  return (
    <FormFieldContext.Provider value={{ name: props.name, id }}>
      <Controller
        {...props}
        // The id rides on `field`, so it lands on the real input even inside a wrapper div.
        render={(args) => {
          const field = { ...args.field, id };
          return props.render({ ...args, field });
        }}
      />
    </FormFieldContext.Provider>
  );
}

export function FormItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...props} />;
}

export function FormLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  const field = React.useContext(FormFieldContext);
  return <label className={className} htmlFor={field?.id} {...props} />;
}

export function FormControl({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}

// Shows the explicit children if given, otherwise the validation error of the enclosing FormField.
export function FormMessage({ children }: { children?: React.ReactNode }) {
  const field = React.useContext(FormFieldContext);
  const { getFieldState, formState } = useFormContext();
  const error = field ? getFieldState(field.name, formState).error : undefined;
  const body = children ?? error?.message;
  if (!body) return null;
  return (
    <p className="text-sm text-red-500" role={error ? "alert" : undefined}>
      {body}
    </p>
  );
}

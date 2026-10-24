"use client"

import * as React from "react"
import {
    Controller,
    FormProvider,
    useFormContext,
    type ControllerProps,
    type FieldPath,
    type FieldValues,
} from "react-hook-form"

export const Form = FormProvider

const FormFieldContext = React.createContext<{ name: string } | null>(null)

export function FormField<
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
    return (
        <FormFieldContext.Provider value={{ name: props.name }}>
            <Controller {...props} />
        </FormFieldContext.Provider>
    )
}

export function FormItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={className} {...props} />
}

export function FormLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
    return <label className={className} {...props} />
}

export function FormControl({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div {...props} />
}

// Shows the explicit children if given, otherwise the validation error of the enclosing FormField.
export function FormMessage({ children }: { children?: React.ReactNode }) {
    const field = React.useContext(FormFieldContext)
    const { getFieldState, formState } = useFormContext()
    const error = field ? getFieldState(field.name, formState).error : undefined
    const body = children ?? error?.message
    if (!body) return null
    return <p className="text-sm text-red-500" role={error ? "alert" : undefined}>{body}</p>
}

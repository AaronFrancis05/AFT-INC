"use client"

import * as React from "react"
import {
    Controller,
    FormProvider,
    useFormContext,
} from "react-hook-form"

export const Form = FormProvider

export const FormField = Controller

export function FormItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={className} {...props} />
}

export function FormLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
    return <label className={className} {...props} />
}

export function FormControl({ ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div {...props} />
}

export function FormMessage({ children }: { children?: React.ReactNode }) {
    if (!children) return null
    return <p className="text-sm text-red-500">{children}</p>
}
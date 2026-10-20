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

const FormFieldContext = React.createContext<{
    name: string
    id: string
    hasMessage: boolean
    setHasMessage: React.Dispatch<React.SetStateAction<boolean>>
} | null>(null)

export function FormField<
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
    const id = React.useId()
    const [hasMessage, setHasMessage] = React.useState(false)
    return (
        <FormFieldContext.Provider value={{ name: props.name, id, hasMessage, setHasMessage }}>
            <Controller {...props} />
        </FormFieldContext.Provider>
    )
}

export function FormItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={className} {...props} />
}

export function FormLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
    const field = React.useContext(FormFieldContext)
    return <label className={className} {...props} htmlFor={field?.id ?? props.htmlFor} />
}

// Custom controls forward these props; native layout elements are traversed first.
function connectControl(children: React.ReactNode, attributes: React.HTMLAttributes<HTMLElement>) {
    let connected = false
    function visit(children: React.ReactNode): React.ReactNode {
        return React.Children.map(children, (child) => {
            if (connected || !React.isValidElement<React.HTMLAttributes<HTMLElement>>(child)) return child
            if (child.type === React.Fragment || (typeof child.type === "string" && !["input", "select", "textarea", "button"].includes(child.type))) {
                return React.cloneElement(child, {}, visit(child.props.children))
            }
            connected = true
            return React.cloneElement(child, {
                ...attributes,
                id: attributes.id ?? child.props.id,
                "aria-describedby": [child.props["aria-describedby"], attributes["aria-describedby"]].filter(Boolean).join(" ") || undefined,
            })
        })
    }
    return visit(children)
}

export function FormControl({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    const field = React.useContext(FormFieldContext)
    const { getFieldState, formState } = useFormContext()
    const error = field ? getFieldState(field.name, formState).error : undefined
    const control = connectControl(children, {
        id: field?.id,
        "aria-invalid": !!error,
        "aria-describedby": field?.hasMessage ? `${field.id}-message` : undefined,
    })
    return <div {...props}>{control}</div>
}

// Shows the explicit children if given, otherwise the validation error of the enclosing FormField.
export function FormMessage({ children }: { children?: React.ReactNode }) {
    const field = React.useContext(FormFieldContext)
    const { getFieldState, formState } = useFormContext()
    const error = field ? getFieldState(field.name, formState).error : undefined
    const body = children ?? error?.message
    const hasMessage = !!body
    const setHasMessage = field?.setHasMessage
    React.useEffect(() => {
        setHasMessage?.(hasMessage)
        return () => setHasMessage?.(false)
    }, [hasMessage, setHasMessage])
    if (!body) return null
    return <p id={field ? `${field.id}-message` : undefined} className="text-sm text-red-500" role={error ? "alert" : undefined}>{body}</p>
}

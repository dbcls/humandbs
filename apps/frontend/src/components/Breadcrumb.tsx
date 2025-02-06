import { Slot } from '@radix-ui/react-slot'
import { Link } from '@tanstack/react-router'
import { Home, MoreHorizontal } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { FileRoutesByTo } from '@/routeTree.gen'

const Breadcrumb = React.forwardRef<
    HTMLElement,
    React.ComponentPropsWithoutRef<'nav'> & {
        separator?: React.ReactNode
    }
>(({ ...props }, ref) => <nav ref={ref} aria-label="breadcrumb" {...props} />)
Breadcrumb.displayName = 'Breadcrumb'

const BreadcrumbList = React.forwardRef<
    HTMLOListElement,
    React.ComponentPropsWithoutRef<'ol'>
>(({ className, ...props }, ref) => (
    <ol
        ref={ref}
        className={cn(
            'flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5',
            className
        )}
        {...props}
    />
))
BreadcrumbList.displayName = 'BreadcrumbList'

const BreadcrumbItem = React.forwardRef<
    HTMLLIElement,
    React.ComponentPropsWithoutRef<'li'>
>(({ className, ...props }, ref) => (
    <li
        ref={ref}
        className={cn('inline-flex items-center gap-1.5', className)}
        {...props}
    />
))
BreadcrumbItem.displayName = 'BreadcrumbItem'

const BreadcrumbLink = React.forwardRef<
    HTMLAnchorElement,
    React.ComponentPropsWithoutRef<'a'> & {
        asChild?: boolean
    }
>(({ asChild, className, ...props }, ref) => {
    const Comp = asChild ? Slot : 'a'

    return (
        <Comp
            ref={ref}
            className={cn('transition-colors hover:text-foreground', className)}
            {...props}
        />
    )
})
BreadcrumbLink.displayName = 'BreadcrumbLink'

const BreadcrumbPage = React.forwardRef<
    HTMLSpanElement,
    React.ComponentPropsWithoutRef<'span'>
>(({ className, ...props }, ref) => (
    <span
        ref={ref}
        role="link"
        aria-disabled="true"
        aria-current="page"
        className={cn('font-normal text-foreground', className)}
        {...props}
    />
))
BreadcrumbPage.displayName = 'BreadcrumbPage'

const BreadcrumbSeparator = ({
    children,
    className,
    ...props
}: React.ComponentProps<'li'>) => (
    <li
        role="presentation"
        aria-hidden="true"
        className={cn('[&>svg]:w-3.5 [&>svg]:h-3.5', className)}
        {...props}
    >
        {children ?? '/'}
    </li>
)
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator'

const BreadcrumbEllipsis = ({
    className,
    ...props
}: React.ComponentProps<'span'>) => (
    <span
        role="presentation"
        aria-hidden="true"
        className={cn('flex h-9 w-9 items-center justify-center', className)}
        {...props}
    >
        <MoreHorizontal className="size-4" />
        <span className="sr-only">More</span>
    </span>
)
BreadcrumbEllipsis.displayName = 'BreadcrumbElipssis'

export interface BreadcroumbsPath {
    label: string
    href: keyof FileRoutesByTo
}

function Breacrumbs({
    breadcrumbsPath,
}: {
    breadcrumbsPath: BreadcroumbsPath[]
}) {
    return (
        <Breadcrumb>
            <BreadcrumbList>
                {breadcrumbsPath.map(({ label, href }, index) => (
                    <BreadcrumbItem key={href}>
                        <Link
                            to={href}
                            className={cn(' text-foreground-light', {
                                'text-secondary':
                                    index === breadcrumbsPath.length - 1,
                            })}
                        >
                            {index === 0 ? (
                                <Home className=" mr-1 inline" size={12} />
                            ) : null}
                            {label}
                        </Link>
                        {index < breadcrumbsPath.length - 1 && (
                            <BreadcrumbSeparator />
                        )}
                    </BreadcrumbItem>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    )
}

export {
    Breadcrumb,
    BreadcrumbEllipsis,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
    Breacrumbs,
}

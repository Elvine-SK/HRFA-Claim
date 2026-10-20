// Central Nuxt UI overrides (UI spec §3.3). Values come from the design tokens, never from call sites.
export default defineAppConfig({
  ui: {
    colors: { primary: 'indigo', neutral: 'slate' },

    button: {
      slots: {
        base: 'rounded-(--app-r-sm) font-medium active:translate-y-px transition-[background-color,color,filter,transform,box-shadow] duration-150',
      },
      variants: {
        size: {
          sm: {
            base: 'h-[30px] px-2.5 text-[12.5px] gap-1.5',
            leadingIcon: 'size-[15px]',
            trailingIcon: 'size-[15px]',
          },
          md: {
            base: 'h-9 px-3.5 text-[13px] gap-2',
            leadingIcon: 'size-[15px]',
            trailingIcon: 'size-[15px]',
          },
          lg: {
            base: 'h-[46px] px-[18px] text-[14.5px] gap-2',
            leadingIcon: 'size-[17px]',
            trailingIcon: 'size-[17px]',
          },
        },
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class:
            'text-(--app-primary-fg) hover:bg-primary hover:brightness-108 active:bg-primary disabled:hover:brightness-100',
        },
        {
          color: 'neutral',
          variant: 'outline',
          class: 'ring-default bg-default text-default hover:bg-elevated',
        },
        {
          color: 'neutral',
          variant: 'ghost',
          class: 'text-muted hover:text-default',
        },
        { square: true, size: 'md', variant: 'ghost', class: 'size-[34px] p-0 justify-center' },
        { square: true, size: 'sm', class: 'size-[30px] p-0 justify-center' },
        { square: true, size: 'md', variant: 'outline', class: 'size-9 p-0 justify-center' },
      ],
    },

    input: {
      slots: {
        base: 'rounded-(--app-r-sm) placeholder:text-(--app-muted)/70 transition-[box-shadow,color] duration-150',
      },
      variants: {
        size: {
          sm: { base: 'h-9 px-2.5 text-[13px]' },
          md: { base: 'h-10 px-3 text-[13.5px]', leading: 'ps-3', trailing: 'pe-3', leadingIcon: 'size-4' },
        },
        variant: { outline: 'ring-default' },
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: ['outline', 'subtle'],
          class: 'focus-visible:ring-(--app-accent) outline-(--app-accent)/20 focus-visible:outline-3',
        },
      ],
    },

    textarea: {
      slots: {
        base: 'rounded-(--app-r-sm) placeholder:text-(--app-muted)/70 transition-[box-shadow] duration-150',
      },
      variants: {
        size: { md: { base: 'px-3 py-2.5 text-[13.5px]' } },
        variant: { outline: 'ring-default' },
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: ['outline', 'subtle'],
          class: 'focus-visible:ring-(--app-accent) outline-(--app-accent)/20 focus-visible:outline-3',
        },
      ],
    },

    select: {
      slots: {
        base: 'rounded-(--app-r-sm) transition-[box-shadow] duration-150',
        placeholder: 'text-(--app-muted)/70',
        content: 'rounded-(--app-r-md) shadow-(--app-shadow-lg)',
        item: 'rounded-(--app-r-sm)',
      },
      variants: {
        size: { sm: { base: 'h-9 px-2.5 text-[13px]' }, md: { base: 'h-10 px-3 text-[13.5px]' } },
        variant: { outline: 'ring-default' },
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: ['outline', 'subtle'],
          class: 'focus-visible:ring-(--app-accent) outline-(--app-accent)/20 focus-visible:outline-3',
        },
      ],
    },

    selectMenu: {
      slots: { base: 'rounded-(--app-r-sm)', content: 'rounded-(--app-r-md) shadow-(--app-shadow-lg)' },
      variants: { size: { md: { base: 'h-10 px-3 text-[13.5px]' } }, variant: { outline: 'ring-default' } },
    },

    formField: {
      slots: {
        label: 'text-[13px] font-semibold text-default',
        description: 'text-xs text-muted',
        hint: 'text-xs text-muted',
        help: 'mt-1.5 text-xs text-muted',
        error: 'mt-1.5 text-xs font-medium text-error',
      },
      variants: { orientation: { vertical: { container: 'mt-1.5' } } },
    },

    card: {
      slots: {
        root: 'rounded-(--app-r-lg) shadow-(--app-shadow) min-w-0',
        header: 'px-(--app-pad) pt-(--app-pad) pb-0 sm:px-(--app-pad) text-[15px] font-bold',
        body: 'px-(--app-pad) pt-3.5 pb-(--app-pad) sm:px-(--app-pad) sm:pt-3.5 sm:pb-(--app-pad)',
        footer: 'px-(--app-pad) py-3.5 sm:px-(--app-pad) border-t border-default',
      },
      variants: { variant: { outline: { root: 'ring-0 border border-default divide-y-0' } } },
    },

    badge: {
      slots: { base: 'rounded-full font-medium' },
      variants: { size: { md: { base: 'ps-2 pe-[9px] py-[3px] text-xs gap-1.5' } } },
    },

    tabs: {
      slots: {
        trigger: 'text-[13.5px] font-medium data-[state=active]:font-semibold',
        trailingBadge: 'mono',
      },
      compoundVariants: [
        {
          orientation: 'horizontal',
          variant: 'link',
          class: { list: 'gap-0.5', trigger: 'h-[46px] px-3', indicator: 'h-0.5 -bottom-px rounded-none' },
        },
        {
          color: 'primary',
          variant: 'link',
          class: {
            indicator: 'bg-(image:--app-grad) bg-primary',
            trigger: 'data-[state=active]:text-highlighted',
          },
        },
      ],
      defaultVariants: { variant: 'link' },
    },

    modal: {
      slots: {
        header: 'px-5 py-4 min-h-0 sm:px-5',
        title: 'text-base font-bold',
        description: 'mt-0.5 text-[12.5px] text-muted',
        body: 'p-5 sm:p-5',
        footer: 'px-5 py-3.5 sm:px-5 bg-muted justify-end',
        close: 'top-3.5 end-3.5',
      },
      variants: {
        overlay: { true: { overlay: 'bg-[rgb(10_10_20/.45)] backdrop-blur-[3px]' } },
        fullscreen: {
          false: {
            content:
              'max-w-[560px] rounded-(--app-r-lg) shadow-(--app-shadow-lg) ring-default overflow-hidden',
          },
        },
      },
    },

    slideover: {
      slots: { content: 'shadow-(--app-shadow-lg) ring-default' },
      variants: {
        overlay: { true: { overlay: 'bg-[rgb(10_10_20/.35)] backdrop-blur-[2px]' } },
        side: { right: { content: 'w-full max-w-[440px]' } },
      },
      compoundVariants: [
        {
          transition: true,
          side: 'right',
          class: {
            content:
              'data-[state=open]:animate-[slide-in-from-right_250ms_cubic-bezier(.2,.8,.2,1)] data-[state=closed]:animate-[slide-out-to-right_200ms_ease]',
          },
        },
      ],
    },

    dropdownMenu: {
      slots: {
        content: 'min-w-[250px] max-w-[280px] rounded-(--app-r-md) shadow-(--app-shadow-lg)',
        group: 'p-1.5',
        item: 'min-h-[38px] items-center rounded-(--app-r-sm) before:rounded-(--app-r-sm)',
        itemLeadingIcon: 'text-muted',
        label: 'eyebrow',
      },
    },

    popover: {
      slots: { content: 'rounded-(--app-r-md) shadow-(--app-shadow-lg)' },
    },

    tooltip: {
      slots: {
        content:
          'bg-(--app-tip-bg) text-(--app-tip-fg) ring-0 rounded-[7px] h-auto px-2.5 py-1.5 text-xs font-medium',
      },
    },

    kbd: {
      base: 'mono rounded-[5px] px-1.5 font-medium',
      variants: { size: { md: 'h-5 min-w-5 text-[11px]' } },
      compoundVariants: [{ color: 'neutral', variant: 'outline', class: 'ring-default bg-muted text-muted' }],
    },

    switch: {
      slots: { base: 'border-[3px]' },
      variants: {
        size: {
          md: {
            base: 'w-[38px]',
            container: 'h-[22px]',
            thumb: 'size-4 data-[state=checked]:translate-x-4 data-[state=checked]:rtl:-translate-x-4',
          },
        },
      },
      compoundVariants: [{ color: 'primary', class: { base: 'data-[state=checked]:bg-(--app-accent)' } }],
    },

    checkbox: {
      compoundVariants: [
        {
          color: 'primary',
          class: { base: 'data-[state=checked]:bg-(--app-accent) data-[state=checked]:ring-(--app-accent)' },
        },
      ],
    },

    toast: {
      slots: {
        root: 'bg-inverted ring-0 rounded-(--app-r-md) shadow-(--app-shadow-lg) p-3.5 gap-3',
        title: 'text-[13px] font-semibold text-inverted',
        description: 'text-[12.5px] text-(--app-surface)/75',
        close: 'text-(--app-surface)/70 hover:text-inverted hover:bg-transparent',
      },
    },

    breadcrumb: {
      slots: {
        link: 'text-[13px] font-normal',
        separatorIcon: 'opacity-50',
      },
      variants: {
        active: { true: { link: 'text-highlighted font-semibold' }, false: { link: 'text-muted' } },
      },
    },

    pagination: {
      slots: { list: 'gap-1' },
    },

    commandPalette: {
      slots: {
        input: '[&_input]:h-14 [&_input]:text-[15px]',
        item: 'min-h-[42px] items-center before:rounded-(--app-r-sm) data-highlighted:not-data-disabled:before:bg-(--app-accent)/10',
        label: 'eyebrow px-2.5',
      },
    },

    table: {
      slots: {
        root: 'max-h-[640px]',
        base: 'border-separate border-spacing-0',
        th: 'h-10 py-0 px-3 text-[11.5px] uppercase tracking-[.05em] font-medium text-muted bg-muted border-b border-default whitespace-nowrap',
        td: 'h-(--dt-row-h,var(--app-row-h)) py-0 px-3 text-[13px] text-default border-b border-default transition-colors duration-[120ms]',
        tbody:
          'divide-y-0 [&>tr]:data-[selectable=true]:hover:bg-elevated [&>tr]:data-[selectable=true]:cursor-pointer',
        tr: 'data-[selected=true]:bg-(--app-accent)/7',
        empty: 'py-0',
      },
      variants: {
        sticky: {
          true: { thead: 'bg-muted backdrop-blur-none' },
          header: { thead: 'bg-muted backdrop-blur-none' },
        },
      },
    },

    skeleton: {
      base: 'rounded-(--app-r-sm) bg-[linear-gradient(90deg,var(--app-surface-2)_25%,var(--app-hover)_37%,var(--app-surface-2)_63%)] bg-[length:400%_100%] animate-[app-shimmer_1.4s_ease_infinite]',
    },

    avatar: {
      slots: { root: 'font-semibold' },
    },
  },
})

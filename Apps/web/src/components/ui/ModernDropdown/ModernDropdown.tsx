import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../../utils/cn';
import styles from './ModernDropdown.module.css';

export interface ModernDropdownOption<TValue extends string = string> {
  value: TValue;
  label: string;
  disabled?: boolean;
}

export interface ModernDropdownProps<TValue extends string = string> {
  id: string;
  label: string;
  value: TValue;
  options: ReadonlyArray<ModernDropdownOption<TValue>>;
  onChange: (value: TValue) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

const getEnabledIndexes = <TValue extends string>(
  options: ReadonlyArray<ModernDropdownOption<TValue>>,
): number[] => {
  return options.reduce<number[]>((indexes, option, index) => {
    if (!option.disabled) {
      indexes.push(index);
    }

    return indexes;
  }, []);
};

function ModernDropdown<TValue extends string>({
  id,
  label,
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className,
}: ModernDropdownProps<TValue>) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const generatedId = useId();
  const triggerId = `${id}-${generatedId}-trigger`;
  const labelId = `${id}-${generatedId}-label`;
  const listboxId = `${id}-${generatedId}-listbox`;

  const selectedOption = useMemo(() => {
    return options.find((option) => option.value === value);
  }, [options, value]);

  const selectedIndex = useMemo(() => {
    return options.findIndex((option) => option.value === value && !option.disabled);
  }, [options, value]);

  const enabledIndexes = useMemo(() => {
    return getEnabledIndexes(options);
  }, [options]);

  const resolveInitialIndex = useCallback((): number => {
    if (selectedIndex >= 0) {
      return selectedIndex;
    }

    return enabledIndexes[0] ?? -1;
  }, [enabledIndexes, selectedIndex]);

  const focusOptionByIndex = useCallback((index: number): void => {
    if (index < 0) {
      return;
    }

    window.requestAnimationFrame(() => {
      const optionElement = optionRefs.current[index];
      optionElement?.focus();
      optionElement?.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  const getNextEnabledIndex = useCallback(
    (currentIndex: number, direction: 1 | -1): number => {
      if (enabledIndexes.length === 0) {
        return -1;
      }

      if (currentIndex < 0) {
        return direction === 1 ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
      }

      const currentPosition = enabledIndexes.indexOf(currentIndex);
      if (currentPosition < 0) {
        return direction === 1 ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
      }

      const nextPosition =
        (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;

      return enabledIndexes[nextPosition];
    },
    [enabledIndexes],
  );

  const closeDropdown = useCallback((restoreFocus: boolean): void => {
    setIsOpen(false);
    setActiveIndex(-1);

    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
  }, []);

  const openDropdown = useCallback(
    (preferredIndex?: number): void => {
      if (disabled) {
        return;
      }

      const canUsePreferredIndex =
        preferredIndex !== undefined && enabledIndexes.includes(preferredIndex);
      const nextActiveIndex = canUsePreferredIndex
        ? preferredIndex
        : resolveInitialIndex();

      if (nextActiveIndex < 0) {
        return;
      }

      setIsOpen(true);
      setActiveIndex(nextActiveIndex);
      focusOptionByIndex(nextActiveIndex);
    },
    [disabled, enabledIndexes, focusOptionByIndex, resolveInitialIndex],
  );

  const selectOption = useCallback(
    (index: number): void => {
      const option = options[index];
      if (!option || option.disabled) {
        return;
      }

      onChange(option.value);
      closeDropdown(true);
    },
    [closeDropdown, onChange, options],
  );

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (disabled) {
      return;
    }

    switch (event.key) {
      case 'Enter':
      case ' ': {
        event.preventDefault();

        if (isOpen) {
          const resolvedIndex = activeIndex >= 0 ? activeIndex : resolveInitialIndex();
          selectOption(resolvedIndex);
          return;
        }

        openDropdown();
        return;
      }
      case 'ArrowDown': {
        event.preventDefault();

        if (!isOpen) {
          openDropdown(resolveInitialIndex());
          return;
        }

        const nextIndex = getNextEnabledIndex(activeIndex, 1);
        setActiveIndex(nextIndex);
        focusOptionByIndex(nextIndex);
        return;
      }
      case 'ArrowUp': {
        event.preventDefault();

        if (!isOpen) {
          openDropdown(enabledIndexes[enabledIndexes.length - 1]);
          return;
        }

        const nextIndex = getNextEnabledIndex(activeIndex, -1);
        setActiveIndex(nextIndex);
        focusOptionByIndex(nextIndex);
        return;
      }
      case 'Escape': {
        if (isOpen) {
          event.preventDefault();
          closeDropdown(true);
        }
        return;
      }
      default:
        return;
    }
  };

  const handleOptionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const nextIndex = getNextEnabledIndex(index, 1);
        setActiveIndex(nextIndex);
        focusOptionByIndex(nextIndex);
        return;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const nextIndex = getNextEnabledIndex(index, -1);
        setActiveIndex(nextIndex);
        focusOptionByIndex(nextIndex);
        return;
      }
      case 'Home': {
        event.preventDefault();
        const firstIndex = enabledIndexes[0] ?? -1;
        setActiveIndex(firstIndex);
        focusOptionByIndex(firstIndex);
        return;
      }
      case 'End': {
        event.preventDefault();
        const lastIndex = enabledIndexes[enabledIndexes.length - 1] ?? -1;
        setActiveIndex(lastIndex);
        focusOptionByIndex(lastIndex);
        return;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        selectOption(index);
        return;
      }
      case 'Escape': {
        event.preventDefault();
        closeDropdown(true);
        return;
      }
      case 'Tab': {
        closeDropdown(false);
        return;
      }
      default:
        return;
    }
  };

  useEffect(() => {
    optionRefs.current = optionRefs.current.slice(0, options.length);
  }, [options.length]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDownOutside = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target)) {
        closeDropdown(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [closeDropdown, isOpen]);

  return (
    <div ref={containerRef} className={cn(styles.wrapper, className)}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>

      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={cn(styles.trigger, isOpen && styles.triggerOpen, disabled && styles.triggerDisabled)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-labelledby={`${labelId} ${triggerId}`}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        onClick={() => {
          if (isOpen) {
            closeDropdown(false);
            return;
          }

          openDropdown();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={styles.triggerValue}>{selectedOption?.label ?? ''}</span>
        <ChevronDown size={18} className={cn(styles.triggerIcon, isOpen && styles.triggerIconOpen)} />
      </button>

      {isOpen && (
        <div id={listboxId} className={styles.menu} role="listbox" aria-labelledby={labelId}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;

            return (
              <button
                key={option.value}
                id={`${triggerId}-option-${index}`}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={cn(
                  styles.option,
                  isSelected && styles.optionSelected,
                  isActive && styles.optionActive,
                  option.disabled && styles.optionDisabled,
                )}
                disabled={option.disabled}
                onClick={() => selectOption(index)}
                onFocus={() => setActiveIndex(index)}
                onMouseEnter={() => {
                  if (!option.disabled) {
                    setActiveIndex(index);
                  }
                }}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={16} className={styles.checkIcon} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ModernDropdown;

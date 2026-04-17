import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radii, Sizing, Spacing, Typography } from '@/constants/theme';
import type { CountryOption } from '@/services/countryService';

interface CountrySection {
  title: string;
  data: CountryOption[];
}

interface CountryPickerFieldProps {
  label: string;
  value: string;
  countries: CountryOption[];
  commonCountryCodes: readonly string[];
  onChange: (countryCode: string) => void;
  error?: string;
  helperText?: string;
  loading?: boolean;
  placeholder?: string;
  blockedCountryCodes?: readonly string[];
}

function normalizeSearchTerm(value: string): string {
  return value.trim().toLowerCase();
}

export function CountryPickerField({
  label,
  value,
  countries,
  commonCountryCodes,
  onChange,
  error,
  helperText,
  loading = false,
  placeholder = 'Search and select your country',
  blockedCountryCodes,
}: CountryPickerFieldProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const normalizedValue = value.trim().toUpperCase();

  const selectedCountry = useMemo(() => {
    if (!normalizedValue) {
      return null;
    }

    const country = countries.find((c) => c.code === normalizedValue);
    // Don't allow blocked countries to be selected
    if (blockedCountryCodes && blockedCountryCodes.includes(normalizedValue)) {
      return null;
    }
    return country ?? null;
  }, [countries, normalizedValue, blockedCountryCodes]);

  const commonCountryCodeSet = useMemo(() => {
    return new Set(commonCountryCodes.map((code) => code.toUpperCase()));
  }, [commonCountryCodes]);

  const filteredCountries = useMemo(() => {
    const normalizedSearch = normalizeSearchTerm(searchTerm);

    if (!normalizedSearch) {
      return countries;
    }

    const normalizedSearchUpper = normalizedSearch.toUpperCase();

    return countries.filter((country) => {
      // Filter out blocked countries
      if (blockedCountryCodes && blockedCountryCodes.includes(country.code)) {
        return false;
      }

      return (
        country.name.toLowerCase().includes(normalizedSearch) ||
        country.code.includes(normalizedSearchUpper)
      );
    });
  }, [countries, searchTerm, blockedCountryCodes]);

  const sections = useMemo<CountrySection[]>(() => {
    const commonCountries: CountryOption[] = [];
    const allCountries: CountryOption[] = [];

    for (const country of filteredCountries) {
      if (commonCountryCodeSet.has(country.code)) {
        commonCountries.push(country);
      } else {
        allCountries.push(country);
      }
    }

    const sortedCommonCountries = [...commonCountries].sort((left, right) =>
      left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
    );

    const countrySections: CountrySection[] = [];

    if (sortedCommonCountries.length > 0) {
      countrySections.push({
        title: 'Common Locations',
        data: sortedCommonCountries,
      });
    }

    if (allCountries.length > 0) {
      countrySections.push({
        title: 'All Locations',
        data: allCountries,
      });
    }

    return countrySections;
  }, [commonCountryCodeSet, filteredCountries]);

  const fieldLabel = selectedCountry
    ? `${selectedCountry.flag} ${selectedCountry.name}`
    : placeholder;

  const openModal = () => {
    setIsModalVisible(true);
  };

  const closeModal = () => {
    setIsModalVisible(false);
    setSearchTerm('');
  };

  const handleCountrySelect = (countryCode: string) => {
    onChange(countryCode);
    closeModal();
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>

      <TouchableOpacity
        style={[styles.inputRow, !!error && styles.inputRowError]}
        onPress={openModal}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens a searchable country list"
      >
        <View style={styles.iconLeft}>
          <MaterialCommunityIcons
            name="map-marker-radius-outline"
            size={20}
            color={Colors.placeholder}
          />
        </View>

        <View style={styles.inputValueContainer}>
          <Text
            style={[styles.inputText, !selectedCountry && styles.placeholderText]}
            numberOfLines={1}
          >
            {fieldLabel}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <MaterialCommunityIcons
            name="chevron-down"
            size={20}
            color={Colors.textSecondary}
          />
        )}
      </TouchableOpacity>

      {!!helperText && !error && (
        <Text style={styles.helperText}>{helperText}</Text>
      )}
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Modal
        visible={isModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />

          <KeyboardAvoidingView
            style={styles.modalSheetContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Country</Text>
                <TouchableOpacity
                  onPress={closeModal}
                  accessibilityRole="button"
                  accessibilityLabel="Close country picker"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={22}
                    color={Colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.searchRow}>
                <MaterialCommunityIcons
                  name="magnify"
                  size={20}
                  color={Colors.placeholder}
                />
                <TextInput
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  placeholder="Search by country name or ISO code"
                  placeholderTextColor={Colors.placeholder}
                  style={styles.searchInput}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel="Search countries"
                />
              </View>

              <SectionList
                sections={sections}
                keyExtractor={(item) => item.code}
                keyboardShouldPersistTaps="handled"
                stickySectionHeadersEnabled
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContentContainer}
                ListEmptyComponent={
                  <Text style={styles.emptyStateText}>
                    No countries found. Try searching by country name or ISO code.
                  </Text>
                }
                renderSectionHeader={({ section }) => (
                  <View style={styles.sectionHeaderContainer}>
                    <Text style={styles.sectionHeaderText}>{section.title}</Text>
                  </View>
                )}
                renderItem={({ item }) => {
                  const isSelected = item.code === normalizedValue;

                  return (
                    <TouchableOpacity
                      style={[styles.countryRow, isSelected && styles.countryRowSelected]}
                      onPress={() => handleCountrySelect(item.code)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${item.name}, ${item.code}`}
                    >
                      <Text style={styles.countryFlag}>{item.flag}</Text>

                      <View style={styles.countryMeta}>
                        <Text style={styles.countryName}>{item.name}</Text>
                        <Text style={styles.countryCode}>{item.code}</Text>
                      </View>

                      {isSelected && (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={18}
                          color={Colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
  },
  label: {
    ...Typography.captionMedium,
    color: Colors.inputLabel,
    marginBottom: Spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Sizing.inputHeight,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radii.sm,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  inputRowError: {
    borderColor: Colors.error,
  },
  iconLeft: {
    marginRight: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputValueContainer: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  inputText: {
    ...Typography.body,
    color: Colors.text,
  },
  placeholderText: {
    color: Colors.placeholder,
  },

  helperText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.errorText,
    marginTop: Spacing.xs,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 26, 46, 0.3)',
  },
  modalSheetContainer: {
    maxHeight: '84%',
  },
  modalSheet: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    maxHeight: '100%',
  },
  modalHandle: {
    width: 44,
    height: 4,
    borderRadius: Radii.full,
    backgroundColor: Colors.outline,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.title,
    color: Colors.text,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radii.sm,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    minHeight: Sizing.inputHeight,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.text,
    marginLeft: Spacing.sm,
    paddingVertical: Platform.OS === 'ios' ? Spacing.sm : Spacing.xs,
  },
  listContentContainer: {
    paddingBottom: Spacing.md,
  },
  sectionHeaderContainer: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  sectionHeaderText: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
    backgroundColor: Colors.surfaceContainerLow,
  },
  countryRowSelected: {
    backgroundColor: Colors.primaryFixed,
  },
  countryFlag: {
    fontSize: 20,
    marginRight: Spacing.sm,
  },
  countryMeta: {
    flex: 1,
    minWidth: 0,
  },
  countryName: {
    ...Typography.body,
    color: Colors.text,
  },
  countryCode: {
    ...Typography.label,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  emptyStateText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
});

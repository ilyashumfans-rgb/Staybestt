import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  addDays,
  eachDayOfInterval,
  format,
  getDay,
  isAfter,
  isBefore,
  isSameDay,
  startOfDay,
} from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { ThemedText } from '@/components/ThemedText';

type SelectionStep = 'checkIn' | 'checkOut';

interface DateRangeSelectorProps {
  visible: boolean;
  checkIn: Date;
  checkOut: Date;
  onCancel: () => void;
  onApply: (checkIn: Date, checkOut: Date) => void;
}

export function DateRangeSelector({
  visible,
  checkIn,
  checkOut,
  onCancel,
  onApply,
}: DateRangeSelectorProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const today = useMemo(() => startOfDay(new Date()), []);
  const dates = useMemo(
    () => eachDayOfInterval({ start: today, end: addDays(today, 120) }),
    [today],
  );
  const [draftCheckIn, setDraftCheckIn] = useState(startOfDay(checkIn));
  const [draftCheckOut, setDraftCheckOut] = useState<Date | null>(startOfDay(checkOut));
  const [step, setStep] = useState<SelectionStep>('checkIn');

  useEffect(() => {
    if (!visible) return;
    setDraftCheckIn(startOfDay(checkIn));
    setDraftCheckOut(startOfDay(checkOut));
    setStep('checkIn');
  }, [checkIn, checkOut, visible]);

  const months = useMemo(() => {
    const result: { key: string; label: string; days: Date[] }[] = [];
    dates.forEach((date) => {
      const key = format(date, 'yyyy-MM');
      const current = result[result.length - 1];
      if (current?.key === key) current.days.push(date);
      else result.push({ key, label: format(date, 'MMMM yyyy'), days: [date] });
    });
    return result;
  }, [dates]);

  const chooseDate = (date: Date) => {
    if (isBefore(date, today)) return;
    if (step === 'checkIn') {
      setDraftCheckIn(date);
      setDraftCheckOut(null);
      setStep('checkOut');
      return;
    }
    if (!isAfter(date, draftCheckIn)) {
      setDraftCheckIn(date);
      setDraftCheckOut(null);
      return;
    }
    setDraftCheckOut(date);
  };

  const apply = () => {
    if (!draftCheckOut || !isAfter(draftCheckOut, draftCheckIn)) return;
    onApply(draftCheckIn, draftCheckOut);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View>
              <ThemedText type="subtitle" weight="bold">Choose your dates</ThemedText>
              <ThemedText type="caption" color={colors.mutedForeground}>
                {step === 'checkIn' ? 'First, select a check-in date' : 'Now select a check-out date'}
              </ThemedText>
            </View>
            <Pressable onPress={onCancel} hitSlop={10} style={styles.closeButton}>
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>

          <View style={[styles.selection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable style={styles.selectionItem} onPress={() => setStep('checkIn')}>
              <ThemedText type="caption" color={step === 'checkIn' ? colors.primary : colors.mutedForeground} weight="semibold">
                CHECK-IN
              </ThemedText>
              <ThemedText weight="bold">{format(draftCheckIn, 'EEE, MMM d')}</ThemedText>
            </Pressable>
            <Feather name="arrow-right" size={18} color={colors.mutedForeground} />
            <Pressable style={styles.selectionItem} onPress={() => setStep('checkOut')}>
              <ThemedText type="caption" color={step === 'checkOut' ? colors.primary : colors.mutedForeground} weight="semibold">
                CHECK-OUT
              </ThemedText>
              <ThemedText weight="bold">
                {draftCheckOut ? format(draftCheckOut, 'EEE, MMM d') : 'Select date'}
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.weekdays}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
              <ThemedText key={`${day}-${index}`} type="caption" color={colors.mutedForeground} style={styles.weekday}>
                {day}
              </ThemedText>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.calendar}>
            {months.map((month) => (
              <View key={month.key} style={styles.month}>
                <ThemedText weight="bold" style={styles.monthTitle}>{month.label}</ThemedText>
                <View style={styles.days}>
                  {Array.from({ length: getDay(month.days[0]) }).map((_, index) => (
                    <View key={`blank-${index}`} style={styles.dayCell} />
                  ))}
                  {month.days.map((date) => {
                    const isStart = isSameDay(date, draftCheckIn);
                    const isEnd = !!draftCheckOut && isSameDay(date, draftCheckOut);
                    const inRange = !!draftCheckOut && isAfter(date, draftCheckIn) && isBefore(date, draftCheckOut);
                    const disabled = step === 'checkOut' && !isAfter(date, draftCheckIn);
                    return (
                      <Pressable
                        key={date.toISOString()}
                        disabled={disabled}
                        onPress={() => chooseDate(date)}
                        style={[
                          styles.dayCell,
                          inRange && { backgroundColor: colors.accent },
                        ]}
                      >
                        <View style={[
                          styles.dayCircle,
                          (isStart || isEnd) && { backgroundColor: colors.primary },
                        ]}>
                          <ThemedText
                            weight={(isStart || isEnd) ? 'bold' : 'medium'}
                            color={(isStart || isEnd) ? colors.primaryForeground : colors.foreground}
                            style={[styles.dayText, disabled && { opacity: 0.25 }]}
                          >
                            {format(date, 'd')}
                          </ThemedText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable onPress={onCancel} style={[styles.button, { borderColor: colors.border }]}>
              <ThemedText weight="semibold">Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={apply}
              disabled={!draftCheckOut}
              style={[styles.button, styles.applyButton, { backgroundColor: colors.primary, opacity: draftCheckOut ? 1 : 0.45 }]}
            >
              <ThemedText weight="bold" color={colors.primaryForeground}>Apply</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,26,48,0.48)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '88%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    padding: 6,
  },
  selection: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectionItem: {
    flex: 1,
    gap: 2,
  },
  weekdays: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
  },
  calendar: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  month: {
    marginBottom: 20,
  },
  monthTitle: {
    fontSize: 16,
    marginBottom: 8,
  },
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButton: {
    borderWidth: 0,
  },
});
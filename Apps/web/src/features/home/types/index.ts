export interface AgeGroup {
  id: string;
  emoji: string;
  titleKey: string;
  rangeKey: string;
  descKey: string;
  accentColor: string;
  bgColor: string;
}

export interface Feature {
  id: string;
  iconName: string;
  titleKey: string;
  descKey: string;
  accentColor: string;
}

export interface Step {
  number: number;
  emoji: string;
  titleKey: string;
  descKey: string;
}

export interface Testimonial {
  id: string;
  initials: string;
  name: string;
  role: string;
  quote: string;
  avatarColor: string;
  stars: number;
}

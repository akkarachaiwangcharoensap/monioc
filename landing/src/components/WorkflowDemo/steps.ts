export interface WorkflowStep {
    id: number;
    label: string;
    sublabel: string;
    eyebrow: string;
    eyebrowColor: 'violet' | 'emerald' | 'amber' | 'blue' | 'rose';
    heading: string;
    caption: string;
    proOnly?: boolean;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
    {
        id: 1,
        label: 'Upload Receipt',
        sublabel: 'Drag-and-drop any grocery receipt image',
        eyebrow: 'Upload',
        eyebrowColor: 'violet',
        heading: 'Drag and drop a receipt photo.',
        caption: 'Uploads the receipt image and prepares it for scanning.',
    },
    {
        id: 2,
        label: 'Scan & Extract',
        sublabel: 'AI reads and categorizes every item',
        eyebrow: 'Processing',
        eyebrowColor: 'violet',
        heading: 'Edit or crop the image (if needed), then scan.',
        caption: 'The app uses AI to extract the data from your receipt such as names, prices, and make an inference to auto categorize items.',
    },
    {
        id: 3,
        label: 'Review & Edit',
        sublabel: 'Correct extracted data',
        eyebrow: 'Receipt Editor',
        eyebrowColor: 'blue',
        heading: 'Make any necessary corrections to the extracted data.',
        caption: 'You are in control, edit and export data, just like on a spreadsheet.',
    },
    {
        id: 4,
        label: 'View Live Stats',
        sublabel: 'Real-time dashboard',
        eyebrow: 'Dashboard',
        eyebrowColor: 'emerald',
        heading: 'Any changes you make are reflected in your stats immediately.',
        caption: 'View a quick glance at your spending stats in real time.',
        proOnly: false,
    },
    {
        id: 5,
        label: 'Analytics',
        sublabel: 'Charts by week, month, and category',
        eyebrow: 'Analytics',
        eyebrowColor: 'amber',
        heading: 'Understand your spending.',
        caption: 'Make an informed decision by reviewing weekly, monthly, and category breakdowns.',
        proOnly: true,
    },
    {
        id: 6,
        label: 'Price Comparison',
        sublabel: 'Compare to Statistics Canada averages',
        eyebrow: 'Comparison',
        eyebrowColor: 'rose',
        heading: 'Find out if you\'re overpaying.',
        caption: 'Compare your prices to Statistics Canada averages by province. Know when to shop around.',
        proOnly: false,
    },
];

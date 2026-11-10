/**
 * Entirely fictional people and buildings for the demo data set. Names are typical Bangladeshi names but
 * belong to nobody; phone numbers use the unassigned block 01700-000xxx; e-mails use example.com.
 * Areas, zones and thanas are real places in Bangladesh so the zone filters and maps behave realistically.
 */
export interface Person { slug: string; fullName: string; gender: "MALE" | "FEMALE"; occupation: string; dob: string; locale: "bn" | "en" }

export const LANDLORDS: Person[] = [
  { slug: "karim", fullName: "Md. Abdul Karim Chowdhury", gender: "MALE", occupation: "Retired bank officer", dob: "1964-03-12", locale: "bn" },
  { slug: "nasima", fullName: "Nasima Akter Khanam", gender: "FEMALE", occupation: "Business owner", dob: "1972-08-25", locale: "bn" },
  { slug: "rafiq", fullName: "Rafiqul Islam Talukder", gender: "MALE", occupation: "Garments trader", dob: "1968-11-02", locale: "en" },
  { slug: "shahana", fullName: "Shahana Parvin Lipi", gender: "FEMALE", occupation: "Consultant", dob: "1979-01-19", locale: "en" },
  { slug: "mahbub", fullName: "Mahbubur Rahman Bhuiyan", gender: "MALE", occupation: "Importer", dob: "1961-06-30", locale: "bn" },
];

export const TENANTS: Person[] = [
  { slug: "rahim", fullName: "Rahim Uddin Sarker", gender: "MALE", occupation: "Software engineer", dob: "1993-04-14", locale: "en" },
  { slug: "sumaiya", fullName: "Sumaiya Akter Mim", gender: "FEMALE", occupation: "School teacher", dob: "1995-09-03", locale: "bn" },
  { slug: "tanvir", fullName: "Tanvir Hasan Rony", gender: "MALE", occupation: "Sales executive", dob: "1991-12-21", locale: "en" },
  { slug: "farzana", fullName: "Farzana Yeasmin Shila", gender: "FEMALE", occupation: "Nurse", dob: "1994-02-08", locale: "bn" },
  { slug: "imran", fullName: "Imran Hossain Shuvo", gender: "MALE", occupation: "Bank officer", dob: "1990-07-17", locale: "en" },
  { slug: "nusrat", fullName: "Nusrat Jahan Tithi", gender: "FEMALE", occupation: "Graphic designer", dob: "1996-10-29", locale: "en" },
  { slug: "jahid", fullName: "Jahidul Islam Ovi", gender: "MALE", occupation: "Pharmacist", dob: "1989-05-05", locale: "bn" },
  { slug: "mahmuda", fullName: "Mahmuda Begum Rupa", gender: "FEMALE", occupation: "Homemaker", dob: "1987-01-23", locale: "bn" },
  { slug: "sabbir", fullName: "Sabbir Ahmed Emon", gender: "MALE", occupation: "University lecturer", dob: "1988-03-31", locale: "en" },
  { slug: "lamia", fullName: "Lamia Tasnim Prome", gender: "FEMALE", occupation: "Doctor", dob: "1992-11-11", locale: "en" },
  { slug: "kamrul", fullName: "Kamrul Hasan Pavel", gender: "MALE", occupation: "Government service", dob: "1985-08-09", locale: "bn" },
  { slug: "shirin", fullName: "Shirin Sultana Mitu", gender: "FEMALE", occupation: "Boutique owner", dob: "1990-06-15", locale: "bn" },
  { slug: "arif", fullName: "Arifur Rahman Sohan", gender: "MALE", occupation: "Accountant", dob: "1992-02-27", locale: "en" },
  { slug: "taslima", fullName: "Taslima Nasrin Ria", gender: "FEMALE", occupation: "Telecom engineer", dob: "1993-12-02", locale: "en" },
  { slug: "monir", fullName: "Monirul Alam Babu", gender: "MALE", occupation: "Shop owner", dob: "1986-09-19", locale: "bn" },
  { slug: "ayesha", fullName: "Ayesha Siddika Tuli", gender: "FEMALE", occupation: "Banker", dob: "1991-04-06", locale: "bn" },
  { slug: "faisal", fullName: "Faisal Ahmed Joy", gender: "MALE", occupation: "Architect", dob: "1990-01-28", locale: "en" },
  { slug: "rumana", fullName: "Rumana Haque Nila", gender: "FEMALE", occupation: "Journalist", dob: "1994-07-12", locale: "en" },
  { slug: "delwar", fullName: "Delwar Hossain Raju", gender: "MALE", occupation: "Driver supervisor", dob: "1984-10-10", locale: "bn" },
  { slug: "morium", fullName: "Morium Khatun Shapla", gender: "FEMALE", occupation: "Tailor", dob: "1989-03-18", locale: "bn" },
];

export const STAFF = {
  super: { slug: "super", fullName: "Demo Super Admin", username: "dm_super" },
  gov: { slug: "gov", fullName: "Demo Government Admin", username: "dm_gov" },
  guests: [
    { slug: "guest1", fullName: "Nafisa Tabassum Oishi", username: "dm_guest1" },
    { slug: "guest2", fullName: "Arman Kabir Sifat", username: "dm_guest2" },
  ],
};

export interface PropertyDef {
  name: string; owner: number; division: string; district: string; upazila: string; area: string; street: string; postalCode: string; zone?: string;
  floors: number; lat: number; lng: number; units: { no: string; floor: number; beds: number; baths: number; sqft: number; rent: number }[]; vacant: number[]; hue: number;
}

/** 10 properties, 25 units. `vacant` lists unit indexes left empty (5 vacant, 20 let to the 20 tenants). */
export const PROPERTIES: PropertyDef[] = [
  { name: "Shapla Villa", owner: 0, division: "Dhaka", district: "Dhaka", upazila: "Dhanmondi", area: "Dhanmondi", street: "Road 8/A, House 21", postalCode: "1209", zone: "Dhanmondi", floors: 5, lat: 23.7461, lng: 90.3742, hue: 200,
    units: [{ no: "2A", floor: 2, beds: 3, baths: 2, sqft: 1450, rent: 32000 }, { no: "3A", floor: 3, beds: 3, baths: 2, sqft: 1450, rent: 33000 }, { no: "4B", floor: 4, beds: 2, baths: 2, sqft: 1100, rent: 26000 }], vacant: [2] },
  { name: "Nirala Residency", owner: 0, division: "Dhaka", district: "Dhaka", upazila: "Mohammadpur", area: "Mohammadpur", street: "Tajmahal Road, Block C", postalCode: "1207", floors: 6, lat: 23.7589, lng: 90.3587, hue: 160,
    units: [{ no: "1A", floor: 1, beds: 2, baths: 1, sqft: 950, rent: 17000 }, { no: "2B", floor: 2, beds: 3, baths: 2, sqft: 1250, rent: 21000 }, { no: "5A", floor: 5, beds: 3, baths: 2, sqft: 1250, rent: 22000 }], vacant: [] },
  { name: "Aparajita Tower", owner: 1, division: "Dhaka", district: "Dhaka", upazila: "Uttara", area: "Uttara Sector 4", street: "Road 12, House 7", postalCode: "1230", zone: "Uttara Sector 4", floors: 7, lat: 23.8759, lng: 90.3795, hue: 280,
    units: [{ no: "3C", floor: 3, beds: 3, baths: 2, sqft: 1300, rent: 24000 }, { no: "4C", floor: 4, beds: 3, baths: 2, sqft: 1300, rent: 24500 }, { no: "6A", floor: 6, beds: 2, baths: 2, sqft: 1000, rent: 19000 }], vacant: [2] },
  { name: "Rupayan Nibash", owner: 1, division: "Dhaka", district: "Dhaka", upazila: "Badda", area: "Bashundhara R/A", street: "Block D, Road 5", postalCode: "1229", zone: "Bashundhara R/A", floors: 8, lat: 23.8193, lng: 90.4271, hue: 330,
    units: [{ no: "2D", floor: 2, beds: 3, baths: 3, sqft: 1650, rent: 30000 }, { no: "5D", floor: 5, beds: 3, baths: 3, sqft: 1650, rent: 31500 }, { no: "7D", floor: 7, beds: 4, baths: 3, sqft: 2100, rent: 42000 }], vacant: [2] },
  { name: "Meghna Heights", owner: 2, division: "Dhaka", district: "Dhaka", upazila: "Mirpur", area: "Mirpur DOHS", street: "Avenue 3, Road 11", postalCode: "1216", zone: "Mirpur DOHS", floors: 6, lat: 23.8353, lng: 90.3686, hue: 20,
    units: [{ no: "1B", floor: 1, beds: 2, baths: 2, sqft: 1050, rent: 20000 }, { no: "3B", floor: 3, beds: 3, baths: 2, sqft: 1350, rent: 25000 }, { no: "4B", floor: 4, beds: 3, baths: 2, sqft: 1350, rent: 25500 }], vacant: [] },
  { name: "Shonar Bangla Garden", owner: 2, division: "Dhaka", district: "Dhaka", upazila: "Mirpur", area: "Mirpur 10", street: "Section 10, Block B", postalCode: "1216", floors: 5, lat: 23.8069, lng: 90.3687, hue: 100,
    units: [{ no: "2A", floor: 2, beds: 2, baths: 1, sqft: 900, rent: 14500 }, { no: "3A", floor: 3, beds: 2, baths: 1, sqft: 900, rent: 15000 }], vacant: [1] },
  { name: "Gulshan Lake View", owner: 3, division: "Dhaka", district: "Dhaka", upazila: "Gulshan", area: "Gulshan 2", street: "Road 63, House 4", postalCode: "1212", floors: 9, lat: 23.7925, lng: 90.4078, hue: 215,
    units: [{ no: "6A", floor: 6, beds: 4, baths: 4, sqft: 2400, rent: 70000 }, { no: "8A", floor: 8, beds: 4, baths: 4, sqft: 2400, rent: 75000 }], vacant: [] },
  { name: "Banani Court", owner: 3, division: "Dhaka", district: "Dhaka", upazila: "Banani", area: "Banani", street: "Road 11, Block F", postalCode: "1213", floors: 7, lat: 23.7937, lng: 90.4066, hue: 250,
    units: [{ no: "3B", floor: 3, beds: 3, baths: 3, sqft: 1800, rent: 48000 }, { no: "5B", floor: 5, beds: 3, baths: 3, sqft: 1800, rent: 50000 }], vacant: [1] },
  { name: "Panchlaish Pearl", owner: 4, division: "Chattogram", district: "Chattogram", upazila: "Panchlaish", area: "Panchlaish", street: "Zakir Hossain Road", postalCode: "4203", floors: 6, lat: 22.3623, lng: 91.8222, hue: 180,
    units: [{ no: "2A", floor: 2, beds: 3, baths: 2, sqft: 1300, rent: 20000 }, { no: "4A", floor: 4, beds: 3, baths: 2, sqft: 1300, rent: 21000 }], vacant: [] },
  { name: "Khulshi Hill View", owner: 4, division: "Chattogram", district: "Chattogram", upazila: "Khulshi", area: "Khulshi", street: "Mehedibag Road", postalCode: "4225", floors: 5, lat: 22.3569, lng: 91.8084, hue: 40,
    units: [{ no: "1A", floor: 1, beds: 2, baths: 2, sqft: 1100, rent: 18000 }, { no: "3A", floor: 3, beds: 3, baths: 2, sqft: 1400, rent: 23000 }], vacant: [1] },
];

export const MAINTENANCE: { cat: string; title: string; desc: string }[] = [
  { cat: "PLUMBING", title: "Kitchen sink is leaking", desc: "Water drips under the kitchen sink every night. The cabinet floor is getting damp." },
  { cat: "ELECTRICAL", title: "Bedroom light keeps flickering", desc: "The ceiling light in the master bedroom flickers and sometimes goes off by itself." },
  { cat: "PLUMBING", title: "Bathroom drain is blocked", desc: "Water collects in the bathroom and drains very slowly." },
  { cat: "OTHER", title: "Main door lock is stuck", desc: "The key turns only after several tries. Worried it will jam completely." },
  { cat: "ELECTRICAL", title: "Ceiling fan makes a loud noise", desc: "The living room fan makes a grinding noise at medium and high speed." },
  { cat: "PLUMBING", title: "No hot water from the geyser", desc: "The bathroom geyser switches on but water stays cold." },
  { cat: "OTHER", title: "Balcony door latch is broken", desc: "The latch snapped and the door does not close properly during rain." },
  { cat: "ELECTRICAL", title: "Socket in the kitchen sparks", desc: "A small spark appears when I plug in the rice cooker. I stopped using it." },
  { cat: "PLUMBING", title: "Overhead tank overflows", desc: "The water tank overflows every morning after the motor runs." },
  { cat: "OTHER", title: "Paint peeling in the bedroom wall", desc: "Damp patch and peeling paint on the north wall of the bedroom." },
  { cat: "ELECTRICAL", title: "Intercom is not working", desc: "The intercom in the unit does not ring when visitors call from the gate." },
  { cat: "OTHER", title: "Window glass cracked", desc: "A crack appeared on the living room window glass after the storm." },
  { cat: "PLUMBING", title: "Low water pressure on the top floor", desc: "Taps barely run in the evening, especially in the bathroom." },
  { cat: "ELECTRICAL", title: "Lift button panel not lighting", desc: "The call button panel on our floor does not light up." },
];

export const COMPLAINTS: { cat: string; subject: string; desc: string }[] = [
  { cat: "SECURITY", subject: "Gate guard leaves the main gate unattended at night", desc: "Between 1 and 3 am the gate is open and nobody is at the guard room. Residents feel unsafe." },
  { cat: "NOISE", subject: "Loud construction work after 10 pm", desc: "Drilling continues in the adjacent building until midnight almost every day." },
  { cat: "SANITATION", subject: "Garbage is not collected from the building", desc: "Waste piles up near the back gate for days and attracts stray animals." },
  { cat: "UTILITY", subject: "Frequent gas pressure drops", desc: "For two weeks the gas line has very low pressure between 6 and 9 pm." },
  { cat: "SAFETY", subject: "Fire exit on the 4th floor is blocked", desc: "Boxes are stacked in front of the fire exit staircase door." },
  { cat: "PARKING", subject: "Outside cars block the building entrance", desc: "Unknown vehicles are parked across the entrance and our residents cannot get out." },
  { cat: "BEHAVIOUR", subject: "Rude behaviour from the caretaker", desc: "The caretaker shouted at my family when we asked about the lift repair." },
  { cat: "UTILITY", subject: "Water supply cut for most of the day", desc: "The WASA line supply is unreliable and the building motor is often switched off." },
];

export const DM_CHATS: [string, string][][] = [
  [["owner", "Assalamu alaikum. This is a reminder that this month's rent is due on the 5th."], ["tenant", "Walaikum assalam, bhaiya. I will send it through bKash today."], ["owner", "Thank you. Please send the transaction ID too."], ["tenant", "Done. TrxID shared in the payment page."]],
  [["tenant", "Sir, the kitchen tap has started leaking again. Could you send the plumber?"], ["owner", "Sure, I will send Mr. Hasan tomorrow morning around 10."], ["tenant", "Thank you, someone will be at home."], ["owner", "He finished the repair. Please check and tell me."], ["tenant", "All good now. Thanks a lot!"]],
  [["owner", "Your agreement ends in two months. Would you like to renew?"], ["tenant", "Yes, I would like to stay. Is there any change in the rent?"], ["owner", "A small increase of 5 percent from next term. We can sign next week."], ["tenant", "That is fine. Let me know the day."]],
  [["tenant", "Apa, can I pay this month's rent on the 8th? The salary is delayed."], ["owner", "Okay, no problem. Please pay by the 8th."], ["tenant", "Thank you for understanding."]],
  [["owner", "The building water tank will be cleaned on Friday. Water will be off 9 to 1."], ["tenant", "Noted. Thank you for informing."]],
  [["tenant", "Is it allowed to keep a small cat in the apartment?"], ["owner", "Yes, if it stays clean and does not disturb the neighbours."], ["tenant", "Of course. Thank you!"]],
];

export const SUPPORT_CHATS: [string, string][][] = [
  [["user", "Hello, I paid the monthly fee by bKash but my subscription still shows pending."], ["admin", "Hello! Please share the TrxID and sender number and we will check it right away."], ["user", "TrxID is 9G4K2M7P1Q from 01700000118."], ["admin", "Found it. The payment has been verified and your plan is now active."]],
  [["user", "How can I change my phone number on the profile?"], ["admin", "Open Profile Settings, edit the phone field and save. We will verify it with a code."], ["user", "Done, thank you."]],
  [["user", "I could not find a way to download my rent receipt."], ["admin", "Go to Payment History, open the payment and choose Download Receipt. Let us know if it does not appear."], ["user", "Found it. Thanks!"]],
];

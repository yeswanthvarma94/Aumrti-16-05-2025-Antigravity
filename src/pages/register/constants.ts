export const INDIAN_STATES = [
  "Andaman & Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra & Nagar Haveli",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu & Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

export const HOSPITAL_TYPES = [
  "Private Hospital",
  "Government Hospital",
  "Trust / NGO Hospital",
  "Corporate Hospital",
  "Nursing Home",
  "Clinic",
  "Specialty Center",
  "Dental Clinic",
  "AYUSH Center",
  "Other",
];

export const BED_COUNTS = [
  { label: "Under 30 beds", value: "under_30" },
  { label: "30–50 beds", value: "30_50" },
  { label: "51–100 beds", value: "51_100" },
  { label: "101–200 beds", value: "101_200" },
  { label: "201–500 beds", value: "201_500" },
  { label: "500+ beds", value: "500_plus" },
];

export const DESIGNATIONS = [
  "Medical Director",
  "CEO / Managing Director",
  "Hospital Administrator",
  "IT Head / CTO",
  "Finance Head / CFO",
  "Operations Head",
  "Other",
];

export interface RegistrationData {
  hospitalName: string;
  hospitalType: string;
  state: string;
  bedCount: string;
  phone: string;
  phoneVerified: boolean;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  designation: string;
  address1: string;
  address2: string;
  pincode: string;
  city: string;
  gstin: string;
  nabhAccredited: boolean;
  nabhNumber: string;
  website: string;
  plan: "starter" | "professional" | "enterprise" | "";
  termsAccepted: boolean;
  verificationMethod: "email" | "phone";
}

export const initialData: RegistrationData = {
  hospitalName: "",
  hospitalType: "",
  state: "",
  bedCount: "",
  phone: "",
  phoneVerified: false,
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  designation: "",
  address1: "",
  address2: "",
  pincode: "",
  city: "",
  gstin: "",
  nabhAccredited: false,
  nabhNumber: "",
  website: "",
  plan: "" as any,
  termsAccepted: false,
  verificationMethod: "email",
};

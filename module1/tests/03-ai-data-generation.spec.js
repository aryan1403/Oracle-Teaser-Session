const { test, expect } = require('@playwright/test');
const { faker } = require('@faker-js/faker');

test.describe('AI-Augmented Test Data Generation', () => {
    test('Generate complex KYC/AML regulatory payloads dynamically', async ({ page }) => {
        console.log("AI Data Generated Data");

        // In traditional automation, testers often rely on static JSON files for KYC data.
        // This leads to "flaky" tests when the same static data is flagged by AML systems during testing.
        // AI/Dynamic generation creates unique, compliant payloads for every run.

        // Let's generate a highly complex KYC (Know Your Customer) payload
        const generateKYCPayload = () => {
            return {
                applicantId: faker.string.uuid(),
                personalDetails: {
                    firstName: faker.person.firstName(),
                    lastName: faker.person.lastName(),
                    dateOfBirth: faker.date.birthdate({ min: 18, max: 65, mode: 'age' }).toISOString().split('T')[0],
                    nationality: faker.location.countryCode('alpha-3'),
                    nationalIdType: 'PASSPORT',
                    nationalIdNumber: faker.string.alphanumeric(9).toUpperCase(),
                },
                contactInformation: {
                    email: faker.internet.email(),
                    phone: faker.phone.number('+1 ### ### ####'),
                    residentialAddress: {
                        street: faker.location.streetAddress(),
                        city: faker.location.city(),
                        state: faker.location.state(),
                        zipCode: faker.location.zipCode(),
                        country: faker.location.country()
                    }
                },
                financialProfile: {
                    employmentStatus: faker.helpers.arrayElement(['EMPLOYED', 'SELF_EMPLOYED']),
                    annualIncome: faker.finance.amount({ min: 40000, max: 250000, dec: 0 }),
                    sourceOfFunds: faker.helpers.arrayElement(['SALARY', 'BUSINESS', 'INVESTMENTS']),
                    creditScore: faker.number.int({ min: 550, max: 850 })
                },
                amlScreening: {
                    pepStatus: false, // Politically Exposed Person
                    sanctionsListHit: false,
                    riskRating: faker.helpers.arrayElement(['LOW', 'MEDIUM'])
                },
                generatedAt: new Date().toISOString()
            };
        };

        const payload = generateKYCPayload();

        console.log("\n=======================================================");
        console.log("Generated KYC Regulatory Compliance Payload:");
        console.log(JSON.stringify(payload, null, 2));
        console.log("=======================================================\n");

        // Simulate injecting this payload into a complex API call for evaluation
        console.log("Sending payload to Core Banking API (Mock)...");

        // Wait a second to simulate API call
        await new Promise(r => setTimeout(r, 1000));

        console.log(`Customer ${payload.personalDetails.firstName} ${payload.personalDetails.lastName} successfully registered with Risk Rating: ${payload.amlScreening.riskRating}`);

        // The script successfully handled complex data generation, proving we don't need static datasets.
        expect(payload).toHaveProperty('applicantId');
        expect(payload.personalDetails.nationalIdNumber).toBeDefined();
    });
});

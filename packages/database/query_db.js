const { PrismaClient } = require('@suchewohnung/database');
const prisma = new PrismaClient();
async function main() {
  const cities = await prisma.listing.findMany({ select: { city: true }, distinct: ['city'], take: 10 });
  console.log('Cities:', cities.map(c => c.city));
  const count = await prisma.listing.count();
  console.log('Total listings:', count);
  const sample = await prisma.listing.findFirst();
  console.log('Sample:', JSON.stringify(sample, null, 2));
  const berlinCount = await prisma.listing.count({ where: { city: 'Berlin' } });
  console.log('Berlin count:', berlinCount);
}
main().catch(console.error).finally(() => prisma.$disconnect());

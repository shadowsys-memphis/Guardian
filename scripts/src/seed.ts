import { db } from "@workspace/db";
import {
  appStateTable,
  scheduleTasksTable,
  voiceScriptsTable,
  haldolCycleTable,
  governorPillarsTable,
} from "@workspace/db/schema";

async function seed() {
  console.log("Seeding br(AI)n App database...");

  const existingState = await db.select().from(appStateTable).limit(1);
  if (existingState.length === 0) {
    await db.insert(appStateTable).values({
      currentQuarter: "Q1",
      zombieMode: false,
      motivationLevel: 3,
      activeMessage: "Good morning, friend. Let's take it one step at a time.",
    });
    console.log("✓ App state seeded");
  }

  const existingTasks = await db.select().from(scheduleTasksTable).limit(1);
  if (existingTasks.length === 0) {
    await db.insert(scheduleTasksTable).values([
      {
        quarter: "Q1",
        timeLabel: "0600",
        title: "Wake Up",
        description: "Rise and shine. Start the day.",
        voiceScript: "Good morning friend, it's time to start your day. Let's get up slowly and take a deep breath.",
        order: 1,
        isActive: true,
      },
      {
        quarter: "Q1",
        timeLabel: "0630",
        title: "Morning Medications",
        description: "Take morning meds with water.",
        voiceScript: "Hey friend, it's medicine time. Walk to the kitchen with me. Your meds are right there waiting for you.",
        order: 2,
        isActive: true,
      },
      {
        quarter: "Q1",
        timeLabel: "0700",
        title: "Breakfast",
        description: "Eat a good breakfast.",
        voiceScript: "Time for breakfast. Even something small is good. Let's get some food in you.",
        order: 3,
        isActive: true,
      },
      {
        quarter: "Q1",
        timeLabel: "0800",
        title: "Morning Hygiene",
        description: "Brush teeth, wash face, get dressed.",
        voiceScript: "Let's get cleaned up. Just one step at a time - teeth first, then face, then getting dressed. You've got this.",
        order: 4,
        isActive: true,
      },
      {
        quarter: "Q2",
        timeLabel: "1200",
        title: "Lunch",
        description: "Midday meal.",
        voiceScript: "Lunchtime, friend. Let's get something to eat. Even a sandwich or soup works great.",
        order: 5,
        isActive: true,
      },
      {
        quarter: "Q2",
        timeLabel: "1300",
        title: "Afternoon Activity",
        description: "Light activity or rest as needed.",
        voiceScript: "How are you feeling? This is some free time for you. If you feel up to it, maybe a short walk or just sit outside.",
        order: 6,
        isActive: true,
      },
      {
        quarter: "Q3",
        timeLabel: "1800",
        title: "Dinner",
        description: "Evening meal.",
        voiceScript: "Dinnertime. Let's get you fed. You made it through another day.",
        order: 7,
        isActive: true,
      },
      {
        quarter: "Q3",
        timeLabel: "1900",
        title: "Evening Medications",
        description: "Take evening meds.",
        voiceScript: "Evening meds time, friend. Right there by the sink. You know the drill.",
        order: 8,
        isActive: true,
      },
      {
        quarter: "Q4",
        timeLabel: "2100",
        title: "Wind Down",
        description: "Start winding down for bed.",
        voiceScript: "Time to start winding down. No screens if you can help it. Let's get ready for a good rest.",
        order: 9,
        isActive: true,
      },
      {
        quarter: "Q4",
        timeLabel: "2200",
        title: "Bedtime",
        description: "Lights out, rest time.",
        voiceScript: "Lights out, friend. You did good today. Rest now. I'll check in on you in the morning.",
        order: 10,
        isActive: true,
      },
    ]);
    console.log("✓ Schedule tasks seeded");
  }

  const existingScripts = await db.select().from(voiceScriptsTable).limit(1);
  if (existingScripts.length === 0) {
    await db.insert(voiceScriptsTable).values([
      {
        taskKey: "morning_wake",
        label: "Morning Wake Up Call",
        scriptText: "Good morning friend, it's time to start your day. Let's get up slowly and take a deep breath. You're safe.",
        tone: "gentle",
        isActive: true,
      },
      {
        taskKey: "morning_meds",
        label: "Morning Medications",
        scriptText: "Hey friend, it's medicine time. Walk to the kitchen with me. Your meds are right there waiting for you. Nice and easy.",
        tone: "grounding",
        isActive: true,
      },
      {
        taskKey: "grounding_check",
        label: "Grounding Check-In",
        scriptText: "Hey, I'm with you. Whatever you're hearing right now, I want you to focus on my voice. Name five things you can see around you. You're here, you're safe.",
        tone: "grounding",
        isActive: true,
      },
      {
        taskKey: "zombie_mode_intro",
        label: "Zombie Mode Transition",
        scriptText: "Hey friend, today is a rest day. No pressure, no big tasks. Just take it easy. I'll check in on you a little later. Rest up.",
        tone: "calm",
        isActive: true,
      },
      {
        taskKey: "evening_meds",
        label: "Evening Medications",
        scriptText: "Evening meds time, friend. Right there by the sink. You know the drill. Almost done for the day.",
        tone: "gentle",
        isActive: true,
      },
      {
        taskKey: "bedtime",
        label: "Bedtime Guidance",
        scriptText: "Lights out, friend. You did good today. Rest now. I'll check in on you in the morning. Sleep well.",
        tone: "calm",
        isActive: true,
      },
    ]);
    console.log("✓ Voice scripts seeded");
  }

  const existingCycle = await db.select().from(haldolCycleTable).limit(1);
  if (existingCycle.length === 0) {
    const today = new Date().toISOString().split("T")[0];
    await db.insert(haldolCycleTable).values({
      lastInjectionDate: today,
      notes: "Initial cycle record. Update with actual last injection date.",
    });
    console.log("✓ Haldol cycle seeded");
  }

  const existingPillars = await db.select().from(governorPillarsTable).limit(1);
  if (existingPillars.length === 0) {
    await db.insert(governorPillarsTable).values([
      {
        pillarKey: "productivity",
        name: "Lulubear Bakery",
        description: "Daily status: Optimization of high-leverage client assets. Focus on speed and site audit delivery.",
        focusDurationMins: 60,
        metrics: JSON.stringify([
          "Lulubear site speed audit progress",
          "Optimization asset staging in /projects/lulubear/optimizations",
        ]),
      },
      {
        pillarKey: "passion",
        name: "SS_III",
        description: "Logic problems: Developing the Autonomous IT Department. Shadow AI Service Agent development.",
        focusDurationMins: 120,
        metrics: JSON.stringify([
          "Service Agent logic v0.1 stability",
          "Shadow AI terminal history pattern mapping",
        ]),
      },
      {
        pillarKey: "curiosity",
        name: "Growth",
        description: "Research: AI/Crypto trends, Kraken metrics. High-level strategic synthesis and learning.",
        focusDurationMins: 45,
        metrics: JSON.stringify([
          "Kraken portfolio risk assessment",
          "Latest AI/Crypto research synthesis docs",
        ]),
      },
    ]);
    console.log("✓ Governor pillars seeded");
  }

  console.log("Seeding complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});


import { startOfDay, addHours, areIntervalsOverlapping, parseISO, format } from 'date-fns';

const shifts = [
    {
        id: 1,
        employeeId: 101,
        startTime: '2023-10-23T22:00:00', // Monday 10 PM
        endTime: '2023-10-24T06:00:00',   // Tuesday 6 AM
    }
];

const filteredEmployees = [
    { id: 101, name: 'John Doe' }
];

const checkRedLine = (dayStr, hour) => {
    const day = new Date(dayStr); // e.g. '2023-10-24T00:00:00'
    const dayStart = startOfDay(day);
    const slotStart = addHours(dayStart, hour);
    const slotEnd = addHours(dayStart, hour + 1);

    console.log(`Checking Day: ${format(day, 'yyyy-MM-dd')}, Hour: ${hour}`);
    console.log(`Slot: ${format(slotStart, 'yyyy-MM-dd HH:mm')} - ${format(slotEnd, 'yyyy-MM-dd HH:mm')}`);

    const activeEmployeeIds = new Set();

    shifts.forEach(s => {
        const sStart = parseISO(s.startTime);
        const sEnd = parseISO(s.endTime);

        console.log(`  Shift: ${format(sStart, 'yyyy-MM-dd HH:mm')} - ${format(sEnd, 'yyyy-MM-dd HH:mm')}`);
        
        // Simple overlap check manually to verify
        const manualOverlap = (sStart < slotEnd && sEnd > slotStart);
        console.log(`    Manual Overlap: ${manualOverlap}`);

        if (areIntervalsOverlapping(
            { start: sStart, end: sEnd },
            { start: slotStart, end: slotEnd }
        )) {
            console.log(`    Date-fns Overlap: YES`);
            activeEmployeeIds.add(Number(s.employeeId));
        } else {
            console.log(`    Date-fns Overlap: NO`);
        }
    });

    let count = 0;
    filteredEmployees.forEach(emp => {
        if (activeEmployeeIds.has(Number(emp.id))) {
            count++;
        }
    });
    console.log(`  Count: ${count}`);
    return count;
};

// Test Monday Night (should be covered)
// checkRedLine('2023-10-23T00:00:00', 23);

// Test Tuesday Morning (should be covered)
// Hour 2 on Tuesday (02:00 - 03:00)
checkRedLine('2023-10-24T00:00:00', 2);

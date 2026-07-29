type Note = {
    length: number
    rep: string
}

type Box = {
    length: number
    maximum: number
}

const POSS_NOTES: Note[] = [
    { length: 1, rep: 'E' },
    { length: 2, rep: 'Q' },
    { length: 3, rep: 'R' },
    { length: 4, rep: 'H' },
    { length: 6, rep: 'D' },
    { length: 8, rep: 'W' },
]

const fillBox = (box: Box, noteToTry: Note, notes: string[]): void => {
    if (box.length + noteToTry.length > box.maximum) {
        return;
    }
    
    notes.push(noteToTry.rep);
    box.length += noteToTry.length;
    
    if (box.length === box.maximum) {
        console.log(notes.join(''));
        notes.pop();
        box.length -= noteToTry.length;
        return;
    }
    
    for (const note of POSS_NOTES) {
        fillBox(box, note, notes);
    }
    
    notes.pop();
    box.length -= noteToTry.length;
}

const main = () => {
    const box: Box = {
        length: 0,
        maximum: 8,
    };
    
    for (const note of POSS_NOTES) {
        fillBox(box, note, []);
    }
};

main();

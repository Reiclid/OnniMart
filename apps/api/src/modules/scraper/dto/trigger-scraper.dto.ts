import { ApiProperty } from "@nestjs/swagger";

export class TriggerScraperDto {
    @ApiProperty({example: 'atb', description: 'Name market for parcing'})
    store!: string;
}

export class TriggerScraperResponseDto {
    @ApiProperty({ example: 'queued' })
    status!: string;

    @ApiProperty({ example: 'Завдання поставленно в чергу' })
    message!: string;
}







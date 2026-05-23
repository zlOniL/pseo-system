import { Module } from '@nestjs/common';
import { SupabaseModule } from '../common/supabase.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [SupabaseModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}

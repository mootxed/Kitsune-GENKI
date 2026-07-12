/* session-manager.js — Intra-session learning logic for SRS */
(function (global) {
  /**
   * SessionManager управляет очередью карточек внутри одной сессии обучения.
   * Реализует логику краткосрочного повторения при ошибках.
   * 
   * Основной принцип: "первая попытка" — только при первом показе карточки
   * в сессии применяется полный SM-2 алгоритм. Последующие попытки
   * (если была ошибка) — только внутрисессионное переучивание.
   */
  class SessionManager {
    constructor(cards) {
      // Очередь карточек с метаданными для сессии
      this.queue = cards.map(card => ({
        card,                  // оригинальная карточка из state.srs
        sessionLapses: 0,      // количество ошибок в текущей сессии
        isFirstAttempt: true,  // флаг первой попытки
        completed: false       // завершена ли карточка в сессии
      }));
      
      // Статистика сессии
      this.stats = {
        total: cards.length,
        reviewed: 0,
        perfect: 0,      // без ошибок
        relearned: 0,    // с ошибками, но выучены
        remaining: cards.length
      };
      
      // Базовые шаги откидывания в зависимости от качества ответа
      this.backtrackSteps = {
        0: 10,  // Again → 10 позиций назад
        3: 15   // Hard → 15 позиций назад
      };
      
      this.currentIndex = 0;
    }
    
    /**
     * Получить следующую карточку для показа
     * @returns {Object|null} карточка или null если сессия завершена
     */
    getNextCard() {
      // Фильтруем только незавершённые карточки
      const activeQueue = this.queue.filter(item => !item.completed);
      
      if (activeQueue.length === 0) {
        return null; // сессия завершена
      }
      
      // Берём первую незавершённую карточку
      const item = activeQueue[0];
      return {
        ...item.card,
        sessionLapses: item.sessionLapses,
        isFirstAttempt: item.isFirstAttempt
      };
    }
    
    /**
     * Получить состояние карточки в текущей сессии
     * @param {string} cardId - ID карточки
     * @returns {Object|null} метаданные карточки или null если не найдена
     */
    getCardState(cardId) {
      const item = this.queue.find(item => item.card.id === cardId && !item.completed);
      if (!item) {
        return null;
      }
      return {
        sessionLapses: item.sessionLapses,
        isFirstAttempt: item.isFirstAttempt,
        completed: item.completed
      };
    }
    
    /**
     * Обработать ответ пользователя на карточку
     * @param {string} cardId - ID карточки
     * @param {number} quality - качество ответа (0-5)
     * @param {Object} srsCollection - коллекция карточек из state.srs (объект с ключами-ID)
     */
    answerCard(cardId, quality, srsCollection) {
      // Найти карточку в очереди
      const queueIndex = this.queue.findIndex(
        item => item.card.id === cardId && !item.completed
      );
      
      if (queueIndex === -1) {
        console.warn('Карточка не найдена в очереди:', cardId);
        return;
      }
      
      const item = this.queue[queueIndex];
      // Новое условие успеха: только Good (4) и Easy (5) завершают карточку
      const isError = quality < 4;
      
      // ===== ЛОГИКА ПЕРВОЙ ПОПЫТКИ =====
      if (item.isFirstAttempt) {
        // Применяем полный SM-2 алгоритм
        const cardInSrs = srsCollection[cardId];
        if (cardInSrs) {
          global.SRS.review(cardInSrs, quality);
        }
        
        item.isFirstAttempt = false;
        
        if (isError) {
          // Ошибка при первой попытке → переходим в цикл доучивания
          item.sessionLapses = 1;
          this.stats.relearned++;
          
          // Откидываем карточку назад в очередь
          this._moveCardBack(queueIndex, quality);
          
          // ❌ Сброс стрика "5 подряд" при ошибке
          if (global.QuestSystem) {
            global.QuestSystem.trackStreak(false);
          }
        } else {
          // Правильный ответ при первой попытке → карточка завершена
          item.completed = true;
          this.stats.reviewed++;
          this.stats.perfect++;
          this.stats.remaining--;
          
          // ✅ Трекинг квестов при успешном выполнении карточки
          if (global.QuestSystem) {
            global.QuestSystem.trackCardCompleted();
            // Трекинг стрика "5 подряд" (только при первой попытке и quality >= 4)
            global.QuestSystem.trackStreak(true);
          }
        }
        
        return;
      }
      
      // ===== ЛОГИКА ПОСЛЕДУЮЩИХ ПОПЫТОК (в цикле доучивания) =====
      if (isError) {
        // Очередная ошибка → увеличиваем счётчик и снова откидываем
        item.sessionLapses++;
        this._moveCardBack(queueIndex, quality);
        
        // ❌ Сброс стрика "5 подряд" при ошибке
        if (global.QuestSystem) {
          global.QuestSystem.trackStreak(false);
        }
      } else {
        // Правильный ответ → завершаем карточку
        // ВАЖНО: SRS.review() НЕ вызываем, т.к. штраф уже был при первой попытке
        item.completed = true;
        this.stats.reviewed++;
        this.stats.remaining--;
        
        // ✅ Трекинг квестов (но НЕ стрика, т.к. это не первая попытка)
        if (global.QuestSystem) {
          global.QuestSystem.trackCardCompleted();
          // Стрик НЕ трекаем, т.к. это повторная попытка после ошибки
        }
      }
    }
    
    /**
     * Откинуть карточку назад в очереди
     * @private
     * @param {number} currentIndex - текущий индекс карточки
     * @param {number} quality - качество ответа (0 или 3)
     */
    _moveCardBack(currentIndex, quality) {
      const item = this.queue[currentIndex];
      
      // Определяем базовый шаг на основе качества ответа
      const baseSteps = this.backtrackSteps[quality] || 10; // по умолчанию 10
      
      // Применяем динамическое сокращение при повторных ошибках
      // Формула: baseSteps / sessionLapses, но минимум 1
      const backSteps = Math.max(1, Math.floor(baseSteps / item.sessionLapses));
      
      // Убираем карточку из текущей позиции
      this.queue.splice(currentIndex, 1);
      
      // Находим незавершённые карточки после текущей позиции
      const afterCurrent = this.queue.slice(currentIndex).filter(i => !i.completed);
      
      // Вычисляем новую позицию (не дальше конца очереди)
      const newPosition = Math.min(
        currentIndex + backSteps,
        currentIndex + afterCurrent.length
      );
      
      // Вставляем карточку на новую позицию
      this.queue.splice(newPosition, 0, item);
    }
    
    /**
     * Проверить, завершена ли сессия
     * @returns {boolean}
     */
    isSessionComplete() {
      return this.queue.every(item => item.completed);
    }
    
    /**
     * Получить статистику сессии
     * @returns {Object}
     */
    getStats() {
      return { ...this.stats };
    }
    
    /**
     * Получить прогресс сессии в процентах
     * @returns {number}
     */
    getProgress() {
      if (this.stats.total === 0) return 100;
      return Math.round((this.stats.reviewed / this.stats.total) * 100);
    }
  }
  
  // Экспортируем класс в глобальную область
  global.SessionManager = SessionManager;
})(window);
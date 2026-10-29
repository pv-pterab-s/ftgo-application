package net.chrisrichardson.ftgo.orderservice.sagas.cancelorder;

import io.eventuate.common.json.mapper.JSonMapper;
import io.eventuate.tram.events.publisher.DomainEventPublisher;
import io.eventuate.tram.sagas.orchestration.SagaInstanceFactory;
import net.chrisrichardson.ftgo.accountservice.api.AccountingServiceChannels;
import net.chrisrichardson.ftgo.accountservice.api.ReverseAuthorizationCommand;
import net.chrisrichardson.ftgo.common.CommonJsonMapperInitializer;
import net.chrisrichardson.ftgo.common.UnsupportedStateTransitionException;
import net.chrisrichardson.ftgo.kitchenservice.api.BeginCancelTicketCommand;
import net.chrisrichardson.ftgo.kitchenservice.api.ConfirmCancelTicketCommand;
import net.chrisrichardson.ftgo.kitchenservice.api.KitchenServiceChannels;
import net.chrisrichardson.ftgo.kitchenservice.api.UndoBeginCancelTicketCommand;
import net.chrisrichardson.ftgo.orderservice.api.OrderServiceChannels;
import net.chrisrichardson.ftgo.orderservice.api.events.OrderState;
import net.chrisrichardson.ftgo.orderservice.domain.Order;
import net.chrisrichardson.ftgo.orderservice.domain.OrderDomainEventPublisher;
import net.chrisrichardson.ftgo.orderservice.domain.OrderRepository;
import net.chrisrichardson.ftgo.orderservice.domain.OrderService;
import net.chrisrichardson.ftgo.orderservice.domain.RestaurantRepository;
import net.chrisrichardson.ftgo.orderservice.sagaparticipants.ConfirmCancelOrderCommand;
import net.chrisrichardson.ftgo.orderservice.sagaparticipants.UndoBeginCancelCommand;
import net.chrisrichardson.ftgo.orderservice.sagas.createorder.CreateOrderSaga;
import net.chrisrichardson.ftgo.orderservice.sagas.reviseorder.ReviseOrderSaga;
import net.chrisrichardson.ftgo.orderservice.web.OrderController;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.test.web.servlet.setup.StandaloneMockMvcBuilder;

import java.util.Optional;

import static io.eventuate.tram.sagas.testing.SagaUnitTestSupport.given;
import static net.chrisrichardson.ftgo.orderservice.OrderDetailsMother.*;
import static net.chrisrichardson.ftgo.orderservice.RestaurantMother.AJANTA_ID;
import static org.hamcrest.CoreMatchers.equalTo;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;
import static org.mockito.Matchers.any;
import static org.mockito.Matchers.same;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

public class CancelOrderSagaTest {

  private Order order;
  private OrderRepository orderRepository;
  private SagaInstanceFactory sagaInstanceFactory;
  private CancelOrderSaga cancelOrderSaga;
  private OrderService orderService;
  private OrderController orderController;

  @BeforeClass
  public static void initialize() {
    CommonJsonMapperInitializer.registerMoneyModule();
  }

  @Before
  public void setUp() {
    order = new Order(CONSUMER_ID, AJANTA_ID, DELIVERY_INFORMATION, chickenVindalooLineItems());
    order.setId(ORDER_ID);
    order.noteApproved();
    orderRepository = mock(OrderRepository.class);
    when(orderRepository.findById(ORDER_ID)).thenReturn(Optional.of(order));
    sagaInstanceFactory = mock(SagaInstanceFactory.class);
    cancelOrderSaga = new CancelOrderSaga();
    cancelOrderSaga.initializeSagaDefinition();
    orderService = new OrderService(sagaInstanceFactory, orderRepository,
            mock(DomainEventPublisher.class), mock(RestaurantRepository.class),
            mock(CreateOrderSaga.class), cancelOrderSaga, mock(ReviseOrderSaga.class),
            mock(OrderDomainEventPublisher.class), Optional.empty());
    orderController = new OrderController(orderService, orderRepository);
  }

  @Test
  public void shouldCancelAnOrderAlreadyMarkedPendingByTheHttpEndpoint() {
    CancelOrderSagaData data = requestCancellation();

    given()
            .saga(cancelOrderSaga, data)
            .expect()
            .command(new BeginCancelTicketCommand(AJANTA_ID, ORDER_ID))
            .to(KitchenServiceChannels.COMMAND_CHANNEL)
            .andGiven()
            .successReply()
            .expect()
            .command(new ReverseAuthorizationCommand(CONSUMER_ID, ORDER_ID, CHICKEN_VINDALOO_ORDER_TOTAL))
            .to(AccountingServiceChannels.accountingServiceChannel)
            .andGiven()
            .successReply()
            .expect()
            .command(new ConfirmCancelTicketCommand(AJANTA_ID, ORDER_ID))
            .to(KitchenServiceChannels.COMMAND_CHANNEL)
            .andGiven()
            .successReply()
            .expect()
            .command(new ConfirmCancelOrderCommand(ORDER_ID))
            .to(OrderServiceChannels.COMMAND_CHANNEL);

    // Apply the final command to the same order used by the real HTTP/service entry point.
    // Participant replies above are simulated; this is not a broker/database integration test.
    orderService.confirmCancelled(data.getOrderId());
    assertHttpOrderState(OrderState.CANCELLED);
  }

  @Test
  public void shouldUndoTheInitialPendingTransitionWhenTheKitchenRejectsCancellation() {
    CancelOrderSagaData data = requestCancellation();

    given()
            .saga(cancelOrderSaga, data)
            .expect()
            .command(new BeginCancelTicketCommand(AJANTA_ID, ORDER_ID))
            .to(KitchenServiceChannels.COMMAND_CHANNEL)
            .andGiven()
            .failureReply()
            .expect()
            .command(new UndoBeginCancelCommand(ORDER_ID))
            .to(OrderServiceChannels.COMMAND_CHANNEL);

    orderService.undoCancel(data.getOrderId());
    assertHttpOrderState(OrderState.APPROVED);
  }

  @Test
  public void shouldUndoKitchenAndOrderCancellationWhenAuthorizationReversalFails() {
    CancelOrderSagaData data = requestCancellation();

    given()
            .saga(cancelOrderSaga, data)
            .expect()
            .command(new BeginCancelTicketCommand(AJANTA_ID, ORDER_ID))
            .to(KitchenServiceChannels.COMMAND_CHANNEL)
            .andGiven()
            .successReply()
            .expect()
            .command(new ReverseAuthorizationCommand(CONSUMER_ID, ORDER_ID, CHICKEN_VINDALOO_ORDER_TOTAL))
            .to(AccountingServiceChannels.accountingServiceChannel)
            .andGiven()
            .failureReply()
            .expect()
            .command(new UndoBeginCancelTicketCommand(AJANTA_ID, ORDER_ID))
            .to(KitchenServiceChannels.COMMAND_CHANNEL)
            .andGiven()
            .successReply()
            .expect()
            .command(new UndoBeginCancelCommand(ORDER_ID))
            .to(OrderServiceChannels.COMMAND_CHANNEL);

    orderService.undoCancel(data.getOrderId());
    assertHttpOrderState(OrderState.APPROVED);
  }

  @Test
  public void shouldNotStartAnotherSagaForAnOrderAlreadyPendingCancellation() {
    requestCancellation();

    try {
      orderService.cancel(ORDER_ID);
      fail("A pending cancellation must not start a second saga");
    } catch (UnsupportedStateTransitionException expected) {
      assertEquals(OrderState.CANCEL_PENDING, order.getState());
    }

    verify(sagaInstanceFactory, times(1)).create(same(cancelOrderSaga), any(CancelOrderSagaData.class));
  }

  @Test
  public void shouldReturnNotFoundWithoutStartingACancellationSaga() {
    when(orderRepository.findById(ORDER_ID)).thenReturn(Optional.empty());

    io.restassured.module.mockmvc.RestAssuredMockMvc.given()
            .standaloneSetup(controllers())
            .when()
            .post("/orders/" + ORDER_ID + "/cancel")
            .then()
            .statusCode(404);

    verifyZeroInteractions(sagaInstanceFactory);
  }

  private CancelOrderSagaData requestCancellation() {
    io.restassured.module.mockmvc.RestAssuredMockMvc.given()
            .standaloneSetup(controllers())
            .contentType("application/json")
            .body("{}")
            .when()
            .post("/orders/" + ORDER_ID + "/cancel")
            .then()
            .statusCode(200)
            .body("state", equalTo(OrderState.CANCEL_PENDING.name()));

    ArgumentCaptor<CancelOrderSagaData> captured = ArgumentCaptor.forClass(CancelOrderSagaData.class);
    verify(sagaInstanceFactory).create(same(cancelOrderSaga), captured.capture());
    CancelOrderSagaData data = captured.getValue();
    assertEquals(Long.valueOf(ORDER_ID), data.getOrderId());
    assertEquals(CONSUMER_ID, data.getConsumerId());
    assertEquals(AJANTA_ID, data.getRestaurantId());
    assertEquals(CHICKEN_VINDALOO_ORDER_TOTAL, data.getOrderTotal());
    return data;
  }

  private void assertHttpOrderState(OrderState expected) {
    io.restassured.module.mockmvc.RestAssuredMockMvc.given()
            .standaloneSetup(controllers())
            .when()
            .get("/orders/" + ORDER_ID)
            .then()
            .statusCode(200)
            .body("state", equalTo(expected.name()));
  }

  private StandaloneMockMvcBuilder controllers() {
    return MockMvcBuilders.standaloneSetup(orderController)
            .setMessageConverters(new MappingJackson2HttpMessageConverter(JSonMapper.objectMapper));
  }
}
